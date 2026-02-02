/**
 * AutoQA Pilot GitHub Action
 * **Validates: Requirements 10.5**
 * 
 * GitHub Action for triggering AutoQA Pilot test executions
 * and reporting results back to GitHub checks.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import axios, { AxiosError } from 'axios';

interface WebhookTriggerRequest {
  projectId: string;
  testSuiteId?: string;
  environment: string;
  branch?: string;
  commit?: string;
  triggeredBy: string;
  metadata: Record<string, any>;
}

interface WebhookTriggerResponse {
  executionId: string;
  status: string;
  projectId: string;
  testSuiteId?: string;
  environment: string;
  triggeredBy: string;
  startTime: string;
  statusUrl: string;
  logsUrl: string;
  correlationId: string;
  timestamp: string;
}

interface ExecutionStatusResponse {
  executionId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  projectId: string;
  testSuiteId?: string;
  triggeredBy: string;
  startTime: string;
  endTime?: string;
  duration: number;
  results?: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    duration: number;
    artifacts: {
      screenshots: string[];
      videos: string[];
      reports: string[];
      logs: string[];
    };
  };
  metadata: Record<string, any>;
  logsUrl: string;
  correlationId: string;
  timestamp: string;
}

class AutoQAAction {
  private apiUrl: string;
  private apiKey: string;
  private octokit: any;

  constructor() {
    this.apiUrl = core.getInput('api-url', { required: true });
    this.apiKey = core.getInput('api-key', { required: true });
    
    // Initialize GitHub client for status reporting
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      this.octokit = github.getOctokit(token);
    }
  }

  /**
   * Main action execution
   */
  async run(): Promise<void> {
    try {
      core.info('🚀 Starting AutoQA Pilot test execution...');
      
      // Get inputs
      const projectId = core.getInput('project-id', { required: true });
      const testSuiteId = core.getInput('test-suite-id') || undefined;
      const environment = core.getInput('environment') || 'staging';
      const waitForCompletion = core.getBooleanInput('wait-for-completion');
      const timeout = parseInt(core.getInput('timeout')) || 30;
      const failOnTestFailure = core.getBooleanInput('fail-on-test-failure');
      
      // Get GitHub context
      const context = github.context;
      const branch = context.ref.replace('refs/heads/', '');
      const commit = context.sha;
      
      core.info(`📋 Configuration:`);
      core.info(`  Project ID: ${projectId}`);
      core.info(`  Test Suite ID: ${testSuiteId || 'All tests'}`);
      core.info(`  Environment: ${environment}`);
      core.info(`  Branch: ${branch}`);
      core.info(`  Commit: ${commit.substring(0, 8)}`);
      core.info(`  Wait for completion: ${waitForCompletion}`);
      core.info(`  Timeout: ${timeout} minutes`);
      
      // Create GitHub check run
      let checkRunId: number | undefined;
      if (this.octokit) {
        const checkRun = await this.octokit.rest.checks.create({
          owner: context.repo.owner,
          repo: context.repo.repo,
          name: 'AutoQA Pilot Tests',
          head_sha: commit,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          details_url: `${this.apiUrl}/dashboard/projects/${projectId}`,
          output: {
            title: 'AutoQA Pilot Test Execution',
            summary: `Running tests for project ${projectId} on ${environment} environment`,
          },
        });
        
        checkRunId = checkRun.data.id;
        core.info(`✅ Created GitHub check run: ${checkRunId}`);
      }
      
      // Trigger test execution
      const execution = await this.triggerExecution({
        projectId,
        testSuiteId,
        environment,
        branch,
        commit,
        triggeredBy: 'github-actions',
        metadata: {
          repository: context.repo.owner + '/' + context.repo.repo,
          workflow: context.workflow,
          job: context.job,
          runId: context.runId,
          runNumber: context.runNumber,
          actor: context.actor,
          eventName: context.eventName,
          ref: context.ref,
        },
      });
      
      core.info(`🎯 Test execution triggered: ${execution.executionId}`);
      core.setOutput('execution-id', execution.executionId);
      core.setOutput('status', execution.status);
      
      // Update GitHub check run
      if (this.octokit && checkRunId) {
        await this.octokit.rest.checks.update({
          owner: context.repo.owner,
          repo: context.repo.repo,
          check_run_id: checkRunId,
          status: 'in_progress',
          output: {
            title: 'AutoQA Pilot Test Execution',
            summary: `Test execution ${execution.executionId} is running...`,
            text: `View real-time logs: ${execution.logsUrl}`,
          },
        });
      }
      
      if (!waitForCompletion) {
        core.info('⏭️ Not waiting for completion. Test execution continues in background.');
        return;
      }
      
      // Wait for completion
      core.info(`⏳ Waiting for test execution to complete (timeout: ${timeout} minutes)...`);
      const finalStatus = await this.waitForCompletion(execution.executionId, timeout * 60 * 1000);
      
      // Set outputs
      core.setOutput('status', finalStatus.status);
      core.setOutput('results-url', `${this.apiUrl}/dashboard/executions/${execution.executionId}`);
      
      if (finalStatus.results) {
        core.setOutput('total-tests', finalStatus.results.totalTests.toString());
        core.setOutput('passed-tests', finalStatus.results.passedTests.toString());
        core.setOutput('failed-tests', finalStatus.results.failedTests.toString());
        core.setOutput('duration', Math.round(finalStatus.results.duration / 1000).toString());
      }
      
      // Update final GitHub check run
      if (this.octokit && checkRunId) {
        await this.updateFinalCheckRun(checkRunId, finalStatus, context);
      }
      
      // Report results
      this.reportResults(finalStatus);
      
      // Fail action if tests failed and configured to do so
      if (failOnTestFailure && finalStatus.status === 'failed') {
        core.setFailed(`Test execution failed. ${finalStatus.results?.failedTests || 0} tests failed.`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(`❌ AutoQA Pilot action failed: ${errorMessage}`);
      core.setFailed(errorMessage);
      
      // Update GitHub check run with failure
      if (this.octokit) {
        try {
          const context = github.context;
          await this.octokit.rest.checks.create({
            owner: context.repo.owner,
            repo: context.repo.repo,
            name: 'AutoQA Pilot Tests',
            head_sha: context.sha,
            status: 'completed',
            conclusion: 'failure',
            completed_at: new Date().toISOString(),
            output: {
              title: 'AutoQA Pilot Test Execution Failed',
              summary: `Action failed: ${errorMessage}`,
            },
          });
        } catch (checkError) {
          core.warning(`Failed to update GitHub check: ${checkError}`);
        }
      }
    }
  }

  /**
   * Trigger test execution via webhook
   */
  private async triggerExecution(request: WebhookTriggerRequest): Promise<WebhookTriggerResponse> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/api/webhooks/trigger`,
        request,
        {
          headers: {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'AutoQA-GitHub-Action/1.0.0',
          },
          timeout: 30000, // 30 second timeout
        }
      );
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const data = axiosError.response?.data as any;
        
        if (status === 401) {
          throw new Error('Invalid API key. Please check your AutoQA Pilot API key.');
        } else if (status === 400) {
          throw new Error(`Invalid request: ${data?.error?.message || 'Bad request'}`);
        } else if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else {
          throw new Error(`API request failed (${status}): ${data?.error?.message || axiosError.message}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Wait for execution completion
   */
  private async waitForCompletion(executionId: string, timeoutMs: number): Promise<ExecutionStatusResponse> {
    const startTime = Date.now();
    const pollInterval = 10000; // 10 seconds
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getExecutionStatus(executionId);
        
        core.info(`📊 Status: ${status.status} (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
        
        if (['completed', 'failed', 'cancelled'].includes(status.status)) {
          return status;
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        core.warning(`Failed to get execution status: ${error}`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error(`Test execution timed out after ${Math.round(timeoutMs / 60000)} minutes`);
  }

  /**
   * Get execution status
   */
  private async getExecutionStatus(executionId: string): Promise<ExecutionStatusResponse> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/api/webhooks/executions/${executionId}`,
        {
          headers: {
            'X-API-Key': this.apiKey,
            'User-Agent': 'AutoQA-GitHub-Action/1.0.0',
          },
          timeout: 15000, // 15 second timeout
        }
      );
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const data = axiosError.response?.data as any;
        
        if (status === 404) {
          throw new Error(`Execution ${executionId} not found`);
        } else {
          throw new Error(`Failed to get execution status (${status}): ${data?.error?.message || axiosError.message}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Update final GitHub check run
   */
  private async updateFinalCheckRun(
    checkRunId: number,
    status: ExecutionStatusResponse,
    context: typeof github.context
  ): Promise<void> {
    try {
      const conclusion = status.status === 'completed' 
        ? (status.results?.failedTests === 0 ? 'success' : 'failure')
        : status.status === 'failed' 
        ? 'failure' 
        : 'cancelled';
      
      const summary = status.results 
        ? `Tests completed: ${status.results.passedTests} passed, ${status.results.failedTests} failed, ${status.results.skippedTests} skipped`
        : `Test execution ${status.status}`;
      
      const text = [
        `**Execution ID:** ${status.executionId}`,
        `**Status:** ${status.status}`,
        `**Duration:** ${Math.round(status.duration / 1000)}s`,
        status.results && `**Results:** ${status.results.totalTests} total, ${status.results.passedTests} passed, ${status.results.failedTests} failed`,
        `**View Details:** [Test Results](${this.apiUrl}/dashboard/executions/${status.executionId})`,
        `**Logs:** [View Logs](${status.logsUrl})`,
      ].filter(Boolean).join('\n');
      
      await this.octokit.rest.checks.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        check_run_id: checkRunId,
        status: 'completed',
        conclusion,
        completed_at: new Date().toISOString(),
        output: {
          title: `AutoQA Pilot Tests ${conclusion === 'success' ? 'Passed' : 'Failed'}`,
          summary,
          text,
        },
      });
      
      core.info(`✅ Updated GitHub check run with ${conclusion} status`);
      
    } catch (error) {
      core.warning(`Failed to update GitHub check run: ${error}`);
    }
  }

  /**
   * Report test results
   */
  private reportResults(status: ExecutionStatusResponse): void {
    core.info('\n📊 Test Execution Results:');
    core.info(`  Status: ${status.status}`);
    core.info(`  Duration: ${Math.round(status.duration / 1000)}s`);
    
    if (status.results) {
      core.info(`  Total Tests: ${status.results.totalTests}`);
      core.info(`  Passed: ${status.results.passedTests}`);
      core.info(`  Failed: ${status.results.failedTests}`);
      core.info(`  Skipped: ${status.results.skippedTests}`);
      
      if (status.results.artifacts) {
        core.info(`  Screenshots: ${status.results.artifacts.screenshots.length}`);
        core.info(`  Videos: ${status.results.artifacts.videos.length}`);
        core.info(`  Reports: ${status.results.artifacts.reports.length}`);
      }
    }
    
    core.info(`\n🔗 View detailed results: ${this.apiUrl}/dashboard/executions/${status.executionId}`);
    
    // Create job summary
    const summary = [
      '# AutoQA Pilot Test Results',
      '',
      `**Status:** ${status.status === 'completed' ? '✅ Completed' : status.status === 'failed' ? '❌ Failed' : '⚠️ ' + status.status}`,
      `**Execution ID:** ${status.executionId}`,
      `**Duration:** ${Math.round(status.duration / 1000)}s`,
      '',
    ];
    
    if (status.results) {
      summary.push(
        '## Test Results',
        '',
        `| Metric | Count |`,
        `|--------|-------|`,
        `| Total Tests | ${status.results.totalTests} |`,
        `| Passed | ${status.results.passedTests} |`,
        `| Failed | ${status.results.failedTests} |`,
        `| Skipped | ${status.results.skippedTests} |`,
        '',
      );
      
      if (status.results.artifacts) {
        summary.push(
          '## Artifacts',
          '',
          `- Screenshots: ${status.results.artifacts.screenshots.length}`,
          `- Videos: ${status.results.artifacts.videos.length}`,
          `- Reports: ${status.results.artifacts.reports.length}`,
          '',
        );
      }
    }
    
    summary.push(
      '## Links',
      '',
      `- [View Detailed Results](${this.apiUrl}/dashboard/executions/${status.executionId})`,
      `- [View Logs](${status.logsUrl})`,
    );
    
    core.summary.addRaw(summary.join('\n'));
    core.summary.write();
  }
}

// Run the action
if (require.main === module) {
  const action = new AutoQAAction();
  action.run().catch(error => {
    core.setFailed(error.message);
    process.exit(1);
  });
}

export { AutoQAAction };