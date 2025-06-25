const cloudinary=require('cloudinary').v2
 
const fs=require('fs')
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary=async(LocalFilePath)=>{
    try {
        if(!LocalFilePath){
            return null
        }
        //upload file on cloudinary 
        let response=await cloudinary.uploader.upload(LocalFilePath,{
            resource_type:'auto',
            upload_preset:"mediConnect"
        })
        //file has been uploaded successfully
        console.log("file has been uploaded to cloudinary",response.url);
        return response
        
    } catch (error) {
        // not uploaded 
        fs.unlinkSync(LocalFilePath) //remove locally saved temp file
        return null
    }
}

module.exports=uploadOnCloudinary