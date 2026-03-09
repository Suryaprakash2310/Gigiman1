const mongoose = require('mongoose');

const domainserviceschema = mongoose.Schema({
    domainName: {
        type: String,
        required: true,
        trim: true,
    },
    serviceImage: {
        type: String,
        default: null,
    }
}, { timestamps: true, autoIndex: true });

//fast sorting
domainserviceschema.index({ domainName: 1 });


module.exports = mongoose.model("DomainService", domainserviceschema);
