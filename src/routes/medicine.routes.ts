import { Router } from "express";
import { addMedicineManually, getAllMedicines, uploadMedicineCSV } from "../controller/medicineController";
import { uploadCSV } from "../middlewares/uploadCSV";

const router = Router();

//upload medicine csv file
router.post(
  "/upload-csv",
  uploadCSV.single("file"),
  uploadMedicineCSV
);

//upload single medicine
router.post(
  "/", addMedicineManually
)

router.get("/", getAllMedicines)

export default router;
