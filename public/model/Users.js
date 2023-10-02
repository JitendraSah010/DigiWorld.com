const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: {type:String, required:true},
    email: {type:String, required: true, unique:true},
    contact: {type:Number, required:true,unique:true},
    address: {type:String, required:true },
    profileImg: {type:String, require:true, default: 'login.png' },
    password: {type:String, required:true},
    role: {type: Number, default: 0},
    isVerified: {type: Boolean },
    verificationCode: {type: String},
    lastOtpRequestAt: { type: Date },
    otpExpiryAt: { type: Date },
    resetPasswordToken: {type: String},
    resetPasswordExpires: {type: Date}
})

module.exports = mongoose.model('users', UserSchema);