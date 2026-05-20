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
      pharmacyShare, pharmacyCommission, availability, avgConsultationTime,
    } = req.body;

    // Pharmacy-scoped duplicate check
    if (licenseNumber && licenseNumber.trim() !== "") {
      const existingDoctor = await Doctor.findOne({ licenseNumber, pharmacyId });
      if (existingDoctor) {
        return res.status(400).json({
          success: false,
          message: `Dr. ${existingDoctor.name} is already registered in your pharmacy with license number ${licenseNumber}.`,
        });
      }
    }

    let photoUrl = "";
    if (req.file) {
      photoUrl = await uploadImageToCloudinary(req.file.buffer, "medisync/doctors");
    }

    const parsedQualifications =
      typeof qualifications === "string" ? JSON.parse(qualifications) : qualifications || [];

    // Support both "availability" array formats:
    // Form sends: { day, from, to } → we store as { dayOfWeek, startTime, endTime }
    let parsedAvailability =
      typeof availability === "string" ? JSON.parse(availability) : availability || [];
    parsedAvailability = parsedAvailability.map((s: any) => ({
      dayOfWeek: s.dayOfWeek || s.day || "",
      startTime: s.startTime || s.from || "",
      endTime: s.endTime || s.to || "",
    }));

    // Use pharmacyShare as pharmacyCommission (frontend field name)
    const commission = Number(pharmacyShare ?? pharmacyCommission) || 0;

    const newDoctor = await Doctor.create({
      pharmacyId,
      name,
      specialization,
      qualifications: parsedQualifications,
      experienceYears: Number(experienceYears) || 0,
      licenseNumber,
      phone,
      email,
      consultationFee: Number(consultationFee),
      pharmacyCommission: commission,
      availability: parsedAvailability,
      avgConsultationTime: Number(avgConsultationTime) || 15,
      photoUrl,
    });

    return res.status(201).json({ success: true, message: "Doctor added successfully", data: newDoctor });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllDoctors = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user?.pharmacyId;
    const filter: any = { pharmacyId };
    if (req.query.active === "true") filter.isActive = true;

    const doctors = await Doctor.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: doctors });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getDoctorById = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user?.pharmacyId;
    const doctor = await Doctor.findOne({ _id: req.params.id, pharmacyId });
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });
    return res.status(200).json({ success: true, data: doctor });
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

    const updateData: any = { ...req.body };

    // License duplicate check
    if (updateData.licenseNumber && updateData.licenseNumber !== doctor.licenseNumber) {
      const existingDoctor = await Doctor.findOne({
        licenseNumber: updateData.licenseNumber,
        pharmacyId,
        _id: { $ne: doctorId },
      });
      if (existingDoctor) {
        return res.status(400).json({
          success: false,
          message: `Another doctor in your pharmacy is already using license number ${updateData.licenseNumber}.`,
        });
      }
    }

    if (updateData.qualifications && typeof updateData.qualifications === "string") {
      updateData.qualifications = JSON.parse(updateData.qualifications);
    }

    if (updateData.availability && typeof updateData.availability === "string") {
      updateData.availability = JSON.parse(updateData.availability);
    }

    // Normalize availability format
    if (Array.isArray(updateData.availability)) {
      updateData.availability = updateData.availability.map((s: any) => ({
        dayOfWeek: s.dayOfWeek || s.day || "",
        startTime: s.startTime || s.from || "",
        endTime: s.endTime || s.to || "",
      }));
    }

    // Normalize pharmacyShare → pharmacyCommission
    if (updateData.pharmacyShare !== undefined) {
      updateData.pharmacyCommission = Number(updateData.pharmacyShare) || 0;
      delete updateData.pharmacyShare;
    }

    if (req.file) {
      if (doctor.photoUrl) await deleteImageFromCloudinary(doctor.photoUrl);
      updateData.photoUrl = await uploadImageToCloudinary(req.file.buffer, "medisync/doctors");
    }

    const updatedDoctor = await Doctor.findByIdAndUpdate(doctorId, updateData, { new: true });
    return res.status(200).json({ success: true, message: "Doctor updated successfully", data: updatedDoctor });
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
    return res.status(200).json({ success: true, message: `Doctor ${doctor.isActive ? "activated" : "deactivated"}`, data: doctor });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteDoctor = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user?.pharmacyId;
    const doctor = await Doctor.findOneAndDelete({ _id: req.params.id, pharmacyId });
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });
    if (doctor.photoUrl) await deleteImageFromCloudinary(doctor.photoUrl);
    return res.status(200).json({ success: true, message: "Doctor deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};