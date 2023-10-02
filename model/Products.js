const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    title: {type:String, required:true},
    img: {type:String, required: true},
    desc: {type:String, required: true},
    pricing: {type:Number, required:true},
    status: {type: Number, default: 0}                       //status:0: product is private,  status:1: product is public
})
module.exports = mongoose.model('products', ProductSchema);