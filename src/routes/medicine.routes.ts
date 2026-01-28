import { Router } from "express";
import { uploadMedicineCSV } from "src/controller/medicineController";
import { uploadCSV } from "src/middlewares/uploadCSV";

const router = Router();

router.post(
  "/upload-csv",
  uploadCSV.single("file"),
  uploadMedicineCSV
);

export default router;
