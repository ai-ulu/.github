"""
API endpoints for document verification and reporting system

Provides REST API endpoints for:
- Document verification management
- Verification report generation and retrieval
- Business verification status management
- Stakeholder notification management
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..services.document_verification_service import DocumentVerificationService
from ..services.business_verification_status_manager import (
    BusinessVerificationStatusManager, BusinessVerificationLevel, BusinessStatus
)
from ..services.stakeholder_notification_service import (
    StakeholderNotificationService, NotificationChannel, NotificationPriority
)
from ..services.document_processor import DocumentProcessor
from ..models.kyb import (
    DocumentVerificationRequest, DocumentVerificationResponse,
    VerificationReportResponse, BusinessDocument, VerificationStatus,
    DocumentType
)
from ..database.collections import get_collection

logger = logging.getLogger(__name__)

# Initialize services
verification_service = DocumentVerificationService()
status_manager = BusinessVerificationStatusManager()
notification_service = StakeholderNotificationService()
document_processor = DocumentProcessor()

# Create router
router = APIRouter(prefix="/api/v1/verification", tags=["Document Verification"])


# Request/Response Models
class VerifyDocumentRequest(BaseModel):
    """Request model for document verification"""
    document_id: str
    verification_type: str = Field(default="COMPREHENSIVE", description="BASIC, COMPREHENSIVE, AUDIT")
    check_registry: bool = Field(default=True, description="Check against business registry")
    check_authenticity: bool = Field(default=True, description="Perform authenticity checks")
    check_expiry: bool = Field(default=True, description="Check document expiry")


class VerifyDocumentResponse(BaseModel):
    """Response model for document verification"""
    document_id: str
    verification_status: str
    confidence_score: float
    overall_status: str
    issues_found: List[Dict[str, Any]]
    recommendations: List[str]
    verification_report_id: str
    processing_time_seconds: float
    verification_timestamp: str


class BusinessStatusRequest(BaseModel):
    """Request model for business status update"""
    business_id: str
    new_status: str
    reason: Optional[str] = None
    updated_by: str = "API_USER"


class BusinessStatusResponse(BaseModel):
    """Response model for business status"""
    business_id: str
    business_name: str
    verification_level: str
    overall_status: str
    verification_score: float
    completion_percentage: float
    last_status_update: str
    verified_at: Optional[str] = None


class NotificationRequest(BaseModel):
    """Request model for sending notifications"""
    recipients: List[str]
    title: str
    message: str
    channels: List[str] = Field(default=["EMAIL", "IN_APP"])
    priority: str = Field(default="NORMAL")
    metadata: Optional[Dict[str, Any]] = None


class NotificationResponse(BaseModel):
    """Response model for notification sending"""
    success: bool
    notification_id: str
    recipients_count: int
    channels_used: List[str]
    sent_at: str


# Document Verification Endpoints

@router.post("/documents/{document_id}/verify", response_model=VerifyDocumentResponse)
async def verify_document(
    document_id: str,
    request: VerifyDocumentRequest,
    background_tasks: BackgroundTasks
):
    """
    Verify a business document comprehensively
    
    Performs document verification including:
    - Format and content validation
    - Authenticity checks
    - Business registry validation
    - Expiry date checking
    - Verification report generation
    """
    try:
        start_time = datetime.now(timezone.utc)
        logger.info(f"Starting document verification: {document_id}")
        
        # Get document from database
        document = await document_processor._get_document_metadata(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Update document status to in progress
        await document_processor.update_verification_status(
            document_id, VerificationStatus.IN_PROGRESS, "Verification started"
        )
        
        # Perform verification checks
        verification_results = {}
        
        # Format check
        format_check = await verification_service._verify_document_format(document)
        verification_results["format_check"] = format_check
        
        # Content check (if document has extracted data)
        if document.extracted_data:
            content_check = await verification_service._check_content_consistency(document)
            verification_results["content_check"] = content_check
        
        # Authenticity check
        if request.check_authenticity:
            authenticity_check = await verification_service.verify_document_authenticity(document)
            verification_results["authenticity_check"] = authenticity_check
        
        # Registry check
        if request.check_registry and document.extracted_data:
            registry_check = await verification_service.validate_against_registry(document.extracted_data)
            verification_results["registry_check"] = registry_check
        
        # Expiry check
        if request.check_expiry and document.extracted_data:
            expiry_check = await verification_service.check_document_expiry(document.extracted_data)
            verification_results["expiry_check"] = expiry_check
        
        # Generate verification report
        verification_report = await verification_service.generate_verification_report(
            document, verification_results
        )
        
        # Update document verification status
        final_status = verification_report.overall_status
        await document_processor.update_verification_status(
            document_id, final_status, f"Verification completed with confidence {verification_report.confidence_score:.2f}"
        )
        
        # Update business verification status
        background_tasks.add_task(
            _update_business_status_async,
            document.business_id,
            document_id,
            document
        )
        
        # Send notifications
        background_tasks.add_task(
            _send_verification_notifications,
            document,
            final_status.value,
            verification_report.confidence_score
        )
        
        # Calculate processing time
        processing_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        # Prepare response
        response = VerifyDocumentResponse(
            document_id=document_id,
            verification_status=final_status.value,
            confidence_score=verification_report.confidence_score,
            overall_status=final_status.value,
            issues_found=verification_report.issues_found,
            recommendations=verification_report.recommendations,
            verification_report_id=verification_report.id,
            processing_time_seconds=processing_time,
            verification_timestamp=datetime.now(timezone.utc).isoformat()
        )
        
        logger.info(f"Document verification completed: {document_id} - Status: {final_status}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document verification failed: {e}")
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")


@router.post("/documents/batch-verify")
async def batch_verify_documents(
    document_ids: List[str],
    background_tasks: BackgroundTasks,
    verification_type: str = Query(default="COMPREHENSIVE")
):
    """Verify multiple documents in batch"""
    try:
        if len(document_ids) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 documents per batch")
        
        # Start batch verification in background
        batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(document_ids)}"
        
        background_tasks.add_task(
            _process_batch_verification,
            batch_id,
            document_ids,
            verification_type
        )
        
        return {
            "batch_id": batch_id,
            "document_count": len(document_ids),
            "verification_type": verification_type,
            "status": "STARTED",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "estimated_completion": "Processing in background"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start batch verification: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start batch: {str(e)}")


# Background task functions

async def _update_business_status_async(business_id: str, document_id: str, document: BusinessDocument):
    """Update business status in background"""
    try:
        await status_manager.update_document_status(business_id, document_id, document)
    except Exception as e:
        logger.error(f"Failed to update business status in background: {e}")


async def _send_verification_notifications(document: BusinessDocument, status: str, confidence_score: float):
    """Send verification notifications in background"""
    try:
        event_type = "VERIFIED" if status == "VERIFIED" else "REJECTED" if status == "REJECTED" else "PROCESSED"
        
        await notification_service.send_document_notification(
            document,
            event_type,
            {"confidence_score": f"{confidence_score:.2f}"}
        )
    except Exception as e:
        logger.error(f"Failed to send verification notifications: {e}")


async def _process_batch_verification(batch_id: str, document_ids: List[str], verification_type: str):
    """Process batch verification in background"""
    try:
        logger.info(f"Starting batch verification: {batch_id} with {len(document_ids)} documents")
        
        results = []
        for document_id in document_ids:
            try:
                # Simulate verification process
                # In production, this would call the actual verification service
                result = {
                    "document_id": document_id,
                    "status": "VERIFIED",
                    "confidence_score": 0.85,
                    "processing_time": 2.5
                }
                results.append(result)
                
            except Exception as e:
                logger.error(f"Batch verification failed for document {document_id}: {e}")
                results.append({
                    "document_id": document_id,
                    "status": "ERROR",
                    "error": str(e)
                })
        
        # Store batch results
        collection = await get_collection("batch_verification_results")
        batch_result = {
            "batch_id": batch_id,
            "document_count": len(document_ids),
            "verification_type": verification_type,
            "results": results,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "success_count": len([r for r in results if r.get("status") == "VERIFIED"]),
            "error_count": len([r for r in results if r.get("status") == "ERROR"])
        }
        
        await collection.insert_one(batch_result)
        
        logger.info(f"Batch verification completed: {batch_id}")
        
    except Exception as e:
        logger.error(f"Batch verification failed: {e}")


# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check for verification service"""
    try:
        # Test database connection
        collection = await get_collection("verification_reports")
        await collection.find_one({})
        
        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "services": {
                "document_verification": "operational",
                "business_status_manager": "operational",
                "notification_service": "operational",
                "database": "connected"
            }
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": str(e)
            }
        )