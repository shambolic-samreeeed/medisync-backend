import { Router } from "express";
import { getSellableMedicinesForPOS } from "src/controller/posController";
import { authenticate } from "src/middlewares/authenticate";

const router = Router();

router.get("/medicines", authenticate, getSellableMedicinesForPOS);

export default router;
