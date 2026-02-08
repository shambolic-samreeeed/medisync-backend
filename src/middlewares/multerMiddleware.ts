/**
 * @file middleware/multerMiddleware.ts
 * @description
 * Multer configuration for CSV upload using memory storage.
 *
 * Your controller reads: req.file.buffer
 * So we use memoryStorage to avoid writing files to disk.
 *
 * Postman usage:
 * - Body: form-data
 * - Key: file
 * - Type: File
 * - Value: select your .csv
 */

import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export default upload;
