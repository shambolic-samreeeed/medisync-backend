import { Router } from "express";
import { getSellableMedicinesForPOS } from "../controller/posController";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

router.get("/medicines", authenticate, getSellableMedicinesForPOS);

export default router;
