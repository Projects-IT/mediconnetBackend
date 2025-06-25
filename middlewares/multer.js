//file upload
const multer  = require('multer')

//unique id
const { v4: uuidv4 } = require('uuid');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, './uploads')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        console.log("inside",file);
        const random=uuidv4()
      cb(null, random+""+file.originalname)
    }
  })
  
  const upload = multer({ storage: storage })
module.exports=upload