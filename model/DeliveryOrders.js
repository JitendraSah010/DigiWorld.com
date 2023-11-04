const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    productName: {type:String, required:true},
    productImg: {type:String, required:true},
    productPrice: {type:Number, required:true},
    productQuantity: {type:Number, default:1 },
    customerName: {type:String, required:true},
    customerEmail: {type:String, required: true},
    customerContact: {type:Number, required:true},
    deliveryAddress: {type:String, required:true},
    orderDate: {type:String, required: true},
    deliveryStatus: {type:Number, default:0},
    deliveredDate: {type: String}

})
module.exports = mongoose.model('DeliveryOrder', orderSchema);