// SPDX-License-Identifier: MIT
// AI-ULU Blockchain Audit Trail
// Immutable record of strategic decisions

pragma solidity ^0.8.19;

/**
 * @title AIULUDecisions
 * @dev Immutable audit trail for AI-ULU strategic decisions
 */
contract AIULUDecisions {
    
    // ============ Types ============
    
    enum DecisionType {
        REPO_CLASSIFICATION,
        AGENT_DEPLOYMENT,
        CHAOS_SCENARIO,
        REPAIR_ACTION,
        POLICY_UPDATE,
        EMERGENCY_ACTION
    }
    
    enum RiskLevel {
        LOW,
        MEDIUM,
        HIGH,
        CRITICAL
    }
    
    struct Decision {
        bytes32 id;
        DecisionType decisionType;
        string target;          // repo name, agent id, etc.
        string reasoning;       // LLM reasoning or explanation
        RiskLevel riskLevel;
        uint256 timestamp;
        address author;         // GodFather address
        bytes32 parentDecision; // for decision chains
        bool executed;
        uint256 executionTime;
    }
    
    struct Bounty {
        bytes32 id;
        string description;
        uint256 reward;
        address hunter;
        bool claimed;
        uint256 claimedAt;
    }
    
    // ============ State ============
    
    // Decision storage
    mapping(bytes32 => Decision) public decisions;
    bytes32[] public decisionIds;
    
    // Bounty system
    mapping(bytes32 => Bounty) public bounties;
    bytes32[] public bountyIds;
    
    // Access control
    mapping(address => bool) public authorizedAgents;
    address public godFather;
    address[] public authorizedAddresses;
    
    // Metrics
    uint256 public totalDecisions;
    uint256 public totalBounties;
    uint256 public totalRewardsPaid;
    
    // ============ Events ============
    
    event DecisionMade(
        bytes32 indexed id,
        DecisionType indexed decisionType,
        string target,
        RiskLevel riskLevel,
        address indexed author,
        uint256 timestamp
    );
    
    event DecisionExecuted(
        bytes32 indexed id,
        uint256 executionTime,
        bool success
    );
    
    event BountyCreated(
        bytes32 indexed id,
        string description,
        uint256 reward
    );
    
    event BountyClaimed(
        bytes32 indexed id,
        address indexed hunter,
        uint256 reward,
        uint256 claimedAt
    );
    
    event AuthorizationGranted(address indexed agent);
    event AuthorizationRevoked(address indexed agent);
    
    // ============ Modifiers ============
    
    modifier onlyGodFather() {
        require(msg.sender == godFather, "AIULU: Only GodFather");
        _;
    }
    
    modifier onlyAuthorized() {
        require(
            msg.sender == godFather || authorizedAgents[msg.sender],
            "AIULU: Not authorized"
        );
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        godFather = msg.sender;
        authorizedAddresses.push(msg.sender);
    }
    
    // ============ Decision Recording ============
    
    /**
     * @dev Record a new strategic decision
     */
    function makeDecision(
        DecisionType decisionType,
        string calldata target,
        string calldata reasoning,
        RiskLevel riskLevel,
        bytes32 parentDecision
    ) external onlyAuthorized returns (bytes32) {
        
        bytes32 decisionId = keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            totalDecisions
        ));
        
        Decision storage d = decisions[decisionId];
        d.id = decisionId;
        d.decisionType = decisionType;
        d.target = target;
        d.reasoning = reasoning;
        d.riskLevel = riskLevel;
        d.timestamp = block.timestamp;
        d.author = msg.sender;
        d.parentDecision = parentDecision;
        d.executed = false;
        
        decisionIds.push(decisionId);
        totalDecisions++;
        
        emit DecisionMade(
            decisionId,
            decisionType,
            target,
            riskLevel,
            msg.sender,
            block.timestamp
        );
        
        return decisionId;
    }
    
    /**
     * @dev Mark a decision as executed
     */
    function markExecuted(bytes32 decisionId, bool success) external onlyAuthorized {
        Decision storage d = decisions[decisionId];
        require(d.timestamp > 0, "AIULU: Decision not found");
        require(!d.executed, "AIULU: Already executed");
        
        d.executed = true;
        d.executionTime = block.timestamp;
        
        emit DecisionExecuted(decisionId, block.timestamp, success);
    }
    
    /**
     * @dev Get decision details
     */
    function getDecision(bytes32 decisionId) external view returns (Decision memory) {
        return decisions[decisionId];
    }
    
    /**
     * @dev Get all decisions (paginated)
     */
    function getDecisions(uint256 offset, uint256 limit) external view returns (Decision[] memory) {
        uint256 end = offset + limit;
        if (end > decisionIds.length) end = decisionIds.length;
        
        Decision[] memory result = new Decision[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = decisions[decisionIds[i]];
        }
        
        return result;
    }
    
    /**
     * @dev Get decisions by type
     */
    function getDecisionsByType(DecisionType decisionType) external view returns (bytes32[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < decisionIds.length; i++) {
            if (decisions[decisionIds[i]].decisionType == decisionType) {
                count++;
            }
        }
        
        bytes32[] memory result = new bytes32[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < decisionIds.length; i++) {
            if (decisions[decisionIds[i]].decisionType == decisionType) {
                result[index++] = decisionIds[i];
            }
        }
        
        return result;
    }
    
    // ============ Bounty System ============
    
    /**
     * @dev Create a bug bounty
     */
    function createBounty(
        string calldata description
    ) external payable onlyGodFather returns (bytes32) {
        require(msg.value > 0, "AIULU: Bounty needs reward");
        
        bytes32 bountyId = keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            totalBounties
        ));
        
        Bounty storage b = bounties[bountyId];
        b.id = bountyId;
        b.description = description;
        b.reward = msg.value;
        b.claimed = false;
        
        bountyIds.push(bountyId);
        totalBounties++;
        
        emit BountyCreated(bountyId, description, msg.value);
        
        return bountyId;
    }
    
    /**
     * @dev Claim a bounty (with verification)
     */
    function claimBounty(bytes32 bountyId, string calldata proof) external {
        Bounty storage b = bounties[bountyId];
        require(b.reward > 0, "AIULU: Bounty not found");
        require(!b.claimed, "AIULU: Already claimed");
        
        // In production, add proof verification here
        // For now, GodFather approves claims
        require(msg.sender != godFather, "AIULU: GodFather cannot claim");
        
        // Mark as claimed (actual payout requires GodFather approval)
        b.hunter = msg.sender;
        
        // Emit event for off-chain verification
        emit BountyClaimed(bountyId, msg.sender, b.reward, block.timestamp);
    }
    
    /**
     * @dev Approve and pay bounty (GodFather only)
     */
    function approveBounty(bytes32 bountyId) external onlyGodFather {
        Bounty storage b = bounties[bountyId];
        require(b.reward > 0, "AIULU: Bounty not found");
        require(!b.claimed, "AIULU: Already claimed");
        require(b.hunter != address(0), "AIULU: No claim submitted");
        
        b.claimed = true;
        b.claimedAt = block.timestamp;
        
        totalRewardsPaid += b.reward;
        
        // Transfer reward
        (bool success, ) = payable(b.hunter).call{value: b.reward}("");
        require(success, "AIULU: Transfer failed");
    }
    
    // ============ Access Control ============
    
    function grantAuthorization(address agent) external onlyGodFather {
        require(!authorizedAgents[agent], "AIULU: Already authorized");
        authorizedAgents[agent] = true;
        authorizedAddresses.push(agent);
        emit AuthorizationGranted(agent);
    }
    
    function revokeAuthorization(address agent) external onlyGodFather {
        require(authorizedAgents[agent], "AIULU: Not authorized");
        authorizedAgents[agent] = false;
        emit AuthorizationRevoked(agent);
    }
    
    function transferGodFather(address newGodFather) external onlyGodFather {
        require(newGodFather != address(0), "AIULU: Invalid address");
        godFather = newGodFather;
    }
    
    // ============ Query Functions ============
    
    function getStats() external view returns (
        uint256 decisions,
        uint256 bounties,
        uint256 rewards,
        uint256 authorizedCount
    ) {
        return (totalDecisions, totalBounties, totalRewardsPaid, authorizedAddresses.length);
    }
    
    function getDecisionCount() external view returns (uint256) {
        return decisionIds.length;
    }
    
    function getBountyCount() external view returns (uint256) {
        return bountyIds.length;
    }
    
    // ============ Fallback ============
    
    receive() external payable {
        // Accept ETH for bounty funding
    }
}
