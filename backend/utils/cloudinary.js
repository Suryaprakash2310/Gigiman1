exports.getProblicId=(url)=>{
    const part=url.split("/");
    const file=part[part.length-1];
    return file.split(".")[0];
}