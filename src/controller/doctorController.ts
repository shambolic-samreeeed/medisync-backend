import { Request, Response } from "express";
import Doctor from "../models/Doctor";
import { uploadImageToCloudinary, deleteImageFromCloudinary } from "../utils/cloudinary";

export const createDoctor = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const { 
      name, specialization, qualifications, experienceYears, 
      licenseNumber, phone, email, consultationFee, 
      pharmacyCommission, scheduleNotes, avgConsultationTime 
    } = req.body;

    let photoUrl = "";
    if (req.file) {
      photoUrl = await uploadImageToCloudinary(req.file.buffer, "medisync/doctors");
    }

    const parsedQualifications = typeof qualifications === 'string' ? JSON.parse(qualifications) : qualifications;

    const newDoctor = await Doctor.create({
      pharmacyId, name, specialization, qualifications: parsedQualifications,
      experienceYears: Number(experienceYears) || 0, licenseNumber, phone, email,
      consultationFee: Number(consultationFee), pharmacyCommission: Number(pharmacyCommission),
      scheduleNotes, avgConsultationTime: Number(avgConsultationTime) || 15, photoUrl,
    });

    return res.status(201).json({ success: true, message: "Doctor added", data: newDoctor });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllDoctors = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user?.pharmacyId;
    const filter: any = { pharmacyId };
    if (req.query.active === 'true') filter.isActive = true;

    const doctors = await Doctor.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: doctors });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateDoctor = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user?.pharmacyId;
    const doctorId = req.params.id;

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId });
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const updateData = { ...req.body };
    if (updateData.qualifications && typeof updateData.qualifications === 'string') {
      updateData.qualifications = JSON.parse(updateData.qualifications);
    }

    if (req.file) {
      if (doctor.photoUrl) await deleteImageFromCloudinary(doctor.photoUrl);
      updateData.photoUrl = await uploadImageToCloudinary(req.file.buffer, "medisync/doctors");
    }

    const updatedDoctor = await Doctor.findByIdAndUpdate(doctorId, updateData, { new: true });
    return res.status(200).json({ success: true, message: "Doctor updated", data: updatedDoctor });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const toggleDoctorStatus = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user?.pharmacyId;
    const doctorId = req.params.id;

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId });
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    doctor.isActive = !doctor.isActive;
    await doctor.save();
    return res.status(200).json({ success: true, message: `Doctor status updated`, data: doctor });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};