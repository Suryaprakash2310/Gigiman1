const errormsg = (status, msg) => {
    const error = new Error(msg);
    error.statusCode = status;
    return error;
};
module.exports = errormsg;  