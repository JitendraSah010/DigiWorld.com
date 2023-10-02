const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    cartTitle: {type:String, required:true},
    cartImg: {type:String, required: true},
    cartDesc: {type:String, required: true},
    cartEmail: {type:String, required: true},
    cartPricing: {type:Number, required:true},
    cartQuantity: {type:Number, default:1 },
    cartDate: {type:String}
})
module.exports = mongoose.model('cart', cartSchema)