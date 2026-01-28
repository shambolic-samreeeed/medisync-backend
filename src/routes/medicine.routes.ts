import { Router } from "express";
import { uploadMedicineCSV } from "../controller/medicineController";
import { uploadCSV } from "../middlewares/uploadCSV";

const router = Router();

router.post(
  "/upload-csv",
  uploadCSV.single("file"),
  uploadMedicineCSV
);

export default router;
