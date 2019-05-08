class Answer{

    constructor(answer, type){
        this.answer = answer;
        this.type = type;
    }

    getAnswer(){
        return this.answer;
    }

    getType(){
        return this.type;
    }
}

module.exports = Answer;