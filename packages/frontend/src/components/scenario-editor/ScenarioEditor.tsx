import React, { useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { TestScenario, TestStep, TestAssertion } from '../../types/scenario';
import { StepEditor } from './StepEditor';
import { AssertionEditor } from './AssertionEditor';
import { NaturalLanguageInput } from './NaturalLanguageInput';
import { CodePreview } from './CodePreview';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface ScenarioEditorProps {
  scenario: TestScenario;
  onScenarioChange: (scenario: TestScenario) => void;
  onGenerateCode: (naturalLanguage: string) => Promise<void>;
  generatedCode?: string;
  isGenerating?: boolean;
}

export const ScenarioEditor: React.FC<ScenarioEditorProps> = ({
  scenario,
  onScenarioChange,
  onGenerateCode,
  generatedCode,
  isGenerating = false
}) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'code'>('visual');
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, type } = result;

    if (type === 'step') {
      const newSteps = Array.from(scenario.steps);
      const [reorderedStep] = newSteps.splice(source.index, 1);
      newSteps.splice(destination.index, 0, reorderedStep);

      onScenarioChange({
        ...scenario,
        steps: newSteps
      });
    } else if (type === 'assertion') {
      const newAssertions = Array.from(scenario.assertions);
      const [reorderedAssertion] = newAssertions.splice(source.index, 1);
      newAssertions.splice(destination.index, 0, reorderedAssertion);

      onScenarioChange({
        ...scenario,
        assertions: newAssertions
      });
    }
  }, [scenario, onScenarioChange]);

  const handleStepChange = useCallback((stepId: string, updatedStep: TestStep) => {
    const newSteps = scenario.steps.map(step =>
      step.id === stepId ? updatedStep : step
    );
    onScenarioChange({
      ...scenario,
      steps: newSteps
    });
  }, [scenario, onScenarioChange]);

  const handleStepDelete = useCallback((stepId: string) => {
    const newSteps = scenario.steps.filter(step => step.id !== stepId);
    onScenarioChange({
      ...scenario,
      steps: newSteps
    });
  }, [scenario, onScenarioChange]);

  const handleStepAdd = useCallback(() => {
    const newStep: TestStep = {
      id: `step-${Date.now()}`,
      type: 'click',
      selector: '',
      value: '',
      description: 'New step',
      timeout: 5000
    };
    onScenarioChange({
      ...scenario,
      steps: [...scenario.steps, newStep]
    });
  }, [scenario, onScenarioChange]);

  const handleAssertionChange = useCallback((assertionId: string, updatedAssertion: TestAssertion) => {
    const newAssertions = scenario.assertions.map(assertion =>
      assertion.id === assertionId ? updatedAssertion : assertion
    );
    onScenarioChange({
      ...scenario,
      assertions: newAssertions
    });
  }, [scenario, onScenarioChange]);

  const handleAssertionDelete = useCallback((assertionId: string) => {
    const newAssertions = scenario.assertions.filter(assertion => assertion.id !== assertionId);
    onScenarioChange({
      ...scenario,
      assertions: newAssertions
    });
  }, [scenario, onScenarioChange]);

  const handleAssertionAdd = useCallback(() => {
    const newAssertion: TestAssertion = {
      id: `assertion-${Date.now()}`,
      type: 'visible',
      selector: '',
      expected: '',
      description: 'New assertion'
    };
    onScenarioChange({
      ...scenario,
      assertions: [...scenario.assertions, newAssertion]
    });
  }, [scenario, onScenarioChange]);

  const handleScenarioMetaChange = useCallback((field: 'name' | 'description', value: string) => {
    onScenarioChange({
      ...scenario,
      [field]: value
    });
  }, [scenario, onScenarioChange]);

  const handleGenerateFromNaturalLanguage = useCallback(async () => {
    if (naturalLanguageInput.trim()) {
      await onGenerateCode(naturalLanguageInput);
      setNaturalLanguageInput('');
    }
  }, [naturalLanguageInput, onGenerateCode]);

  return (
    <div className="scenario-editor bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Test Scenario Editor</h2>
          <div className="flex space-x-2">
            <Button
              variant={activeTab === 'visual' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('visual')}
            >
              Visual Editor
            </Button>
            <Button
              variant={activeTab === 'code' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('code')}
            >
              Code Preview
            </Button>
          </div>
        </div>

        {/* Scenario Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Input
            label="Scenario Name"
            value={scenario.name}
            onChange={(e) => handleScenarioMetaChange('name', e.target.value)}
            placeholder="Enter scenario name"
          />
          <Input
            label="Description"
            value={scenario.description}
            onChange={(e) => handleScenarioMetaChange('description', e.target.value)}
            placeholder="Enter scenario description"
          />
        </div>

        {/* Natural Language Input */}
        <NaturalLanguageInput
          value={naturalLanguageInput}
          onChange={setNaturalLanguageInput}
          onGenerate={handleGenerateFromNaturalLanguage}
          isGenerating={isGenerating}
        />
      </div>

      {/* Content */}
      {activeTab === 'visual' ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Steps Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Test Steps</h3>
                <Button onClick={handleStepAdd} size="sm">
                  Add Step
                </Button>
              </div>

              <Droppable droppableId="steps" type="step">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-2 min-h-[200px] p-4 border-2 border-dashed border-gray-300 rounded-lg"
                  >
                    {scenario.steps.map((step, index) => (
                      <Draggable key={step.id} draggableId={step.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`${
                              snapshot.isDragging ? 'shadow-lg' : ''
                            }`}
                          >
                            <StepEditor
                              step={step}
                              onChange={(updatedStep) => handleStepChange(step.id, updatedStep)}
                              onDelete={() => handleStepDelete(step.id)}
                              isDragging={snapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {scenario.steps.length === 0 && (
                      <div className="text-center text-gray-500 py-8">
                        No steps yet. Add a step or generate from natural language.
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>

            {/* Assertions Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Assertions</h3>
                <Button onClick={handleAssertionAdd} size="sm">
                  Add Assertion
                </Button>
              </div>

              <Droppable droppableId="assertions" type="assertion">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-2 min-h-[200px] p-4 border-2 border-dashed border-gray-300 rounded-lg"
                  >
                    {scenario.assertions.map((assertion, index) => (
                      <Draggable key={assertion.id} draggableId={assertion.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`${
                              snapshot.isDragging ? 'shadow-lg' : ''
                            }`}
                          >
                            <AssertionEditor
                              assertion={assertion}
                              onChange={(updatedAssertion) => handleAssertionChange(assertion.id, updatedAssertion)}
                              onDelete={() => handleAssertionDelete(assertion.id)}
                              isDragging={snapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {scenario.assertions.length === 0 && (
                      <div className="text-center text-gray-500 py-8">
                        No assertions yet. Add an assertion to verify test results.
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        </DragDropContext>
      ) : (
        <CodePreview
          code={generatedCode}
          scenario={scenario}
          isGenerating={isGenerating}
        />
      )}
    </div>
  );
};