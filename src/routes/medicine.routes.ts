import { Router } from "express";
import { getAllMedicines, uploadMedicineCSV } from "../controller/medicineController";
import { uploadCSV } from "../middlewares/uploadCSV";

const router = Router();

router.post(
  "/upload-csv",
  uploadCSV.single("file"),
  uploadMedicineCSV
);

router.get("/", getAllMedicines)

export default router;
