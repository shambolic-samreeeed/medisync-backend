import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadImageToCloudinary = async (fileBuffer: Buffer, folder: string = "medisync"): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folder },
      (error, result) => {
        if (error) return reject(error);
        if (result) return resolve(result.secure_url); 
      }
    );
    uploadStream.end(fileBuffer);
  });
};

export const deleteImageFromCloudinary = async (imageUrl: string) => {
  try {
    if (!imageUrl) return;
    const urlParts = imageUrl.split('/upload/');
    if (urlParts.length === 2) {
      const pathWithoutVersion = urlParts[1].substring(urlParts[1].indexOf('/') + 1); 
      const publicId = pathWithoutVersion.substring(0, pathWithoutVersion.lastIndexOf('.')); 
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (error) {
    console.error("Cloudinary delete error:", error);
  }
};