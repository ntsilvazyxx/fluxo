export function presentStagedChatAttachment(upload) {
  return {
    id: upload.id,
    originalName: upload.originalName,
    mimeType: upload.mimeType,
    sizeBytes: Number(upload.sizeBytes),
    status: upload.status,
    expiresAt: upload.expiresAt,
  };
}
