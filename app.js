var restify = require('restify'); //used to create the rest service 
var builder = require('botbuilder'); //used to create the bot connector
const fs = require('fs'); //used to read the JSON input file
var program = require('commander'); //used to parse console arguments and display help

//By default we are not using questions from an external file
var questionsList = new Map(); //questions
var answerList = new Map(); //answers
var choices;
var isNumeric = false;

const readline = require('readline');

const rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
});



program.version('0.1.0'); // set the program version

//Add the possible and required options
program.option('-t, --tree <file_path>', 'file path to the exported json decision tree');
program.option('-q, --questions <file_path>', 'file path to the question specification file');

//Reading and parsing console arguments
program.parse(process.argv);


if (program.questions) //If the user specified a questions file
   extract_answers(program.questions); //Extract the answers and build the map


var rawdata; // JSON data that need to be parsed

/*
Here we have two different calls to start bot, that is because, having the call (which is the same) outside the if/else would result,
in the second case, in the execution of the bot without the specified JSON, since the reading from STDIN is asynchronous
*/

if (program.tree) { //If the user specified the input file
   rawdata = fs.readFileSync(program.tree); //read it
   start_bot(); //and start the bot
}
else { //otherwise ask the user for the input
   rl.question("Input your JSON here:", (data) => {
      rawdata = data;
      rl.close();
      // Start the bot 
      start_bot();  
   });
}

/*
   Function used to configure and start the bot. Done primarily to allow the user to input JSON from stdin. Readline function is not 
   synchronous and there would have been troubles in starting it without the appropriate data
*/
function start_bot() {

   // Setup Restify Server
   var server = restify.createServer();
   server.listen(process.env.port || process.env.PORT || 3978, function () {
      console.log('%s listening to %s', server.name, server.url);
   });

   // Create chat connector for communicating with the Bot Framework Service
   var connector = new builder.ChatConnector({
      appId: process.env.MicrosoftAppId,
      appPassword: process.env.MicrosoftAppPassword
   });

   // Listen for messages from users 
   server.post('/api/messages', connector.listen());

   //Parsing it using the JSON parser
   var currentNode = JSON.parse(rawdata);

   var inMemoryStorage = new builder.MemoryBotStorage(); //TODO check it

   //Defining bot and dialogs
   var bot = new builder.UniversalBot(connector, [
      function (session) {
         session.userData.node = currentNode;
         session.userData.answerMap = {};
         session.beginDialog("traverseTree");
      }]);

   //disable persistence of conversation data
   bot.set(`persistConversationData`, false);

   bot.on('conversationUpdate', function (message) {
      // Send a hello message when bot is added
      if (message.membersAdded) {
         message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
               var reply = new builder.Message().address(message.address).text("Hi! I am a bot and now I will try to help you! Whenever you are ready, type something so we can start :)");
               bot.send(reply);
            }
         });
      }
   });



  

   bot.dialog("traverseTree", [

      function (session) {

         var node = session.userData.node;
         var answerMap = session.userData.answerMap;

         //if the current label does not have the label property there is an error with the JSON
         if (!node.hasOwnProperty('label')) {

            console.log("ERROR: A node does not have the label property"); //print error message on the console

            //Return generic error message and end the conversation
            session.endConversation("There has been a problem with my decision strategy. Please refer to the terminal logs");
         }

         //if the node does not have any children we send the user the conclusion/last message, we dump the
         // variable states to the console and we terminate
         if (!node.hasOwnProperty('children')) {

            //dump variables from the list
            console.log("-------DUMP VARIABLE START-------");
            console.log(session.userData.answerMap);
            console.log("-------DUMP VARIABLE END-------");

            //clean the answer map
            session.userData.answerMap = {};

            //Print conclusion and end conversation
            //We first check if the conclusion can be found in the questions file
            var conclusion = "My conclusion is: " + node.label;
            
            answerList.forEach(function(val, key, map){
               if(node.label.includes(key)){
                  conclusion = val;
                  console.log("I found " + val + " as corresponding conclusion");
               }
            });
                  
           
            session.send(conclusion);
            session.endConversation("Bye, it has been a pleasure!");
         } else {

            //otherwise we check if we already know the answer before sending the question
            if (answerMap.hasOwnProperty(node.label)) { //if we know the answer we just jump to the right branch
               var nodeLab = node.label;
               var answ = answerMap[nodeLab]; //initialize with the answer

               console.log("answer is " + answ);

               if (answ["type"] == "numeric") {
                  isNumeric = true;
               }

               manageAnswer(session, answ["answer"]); //directly jump to the right branch

            } else { //otherwise we send the question

               //We check if we are using the questions file or the default mode
               var question;
               var retrievedQuestion = questionsList.get(node.label);
               //console.log("retrievedQuestion is " + retrievedQuestion + " after looking for " + node.label);
               if (program.questions && retrievedQuestion != undefined) {
                  question = retrievedQuestion;
               }
               else
                  question = "What is the value of " + node.label; //question

               choices = []; //answer array

               //check type of question, is it a numeric/nominal answer?
               if (node.children[0].hasOwnProperty('edgeLabel') && (node.children[0].edgeLabel.includes('<=') || node.children[0].edgeLabel.includes('>'))) {

                  isNumeric = true; //mark the question as numeric  

                  builder.Prompts.number(session, question); //show the prompt to the user

               } else {

                  node.children.forEach(function (child) { //for each child

                     //if the child does not have the edgeLabel property there is an error in the JSON file
                     if (!child.hasOwnProperty('edgeLabel')) {
                        console.log("ERROR: A child node does not have the edgeLabel property"); //print error message on the console
                        //Return generic error message and end the conversation
                        session.endConversation("There has been a problem with my decision strategy. Please refer to the terminal logs");
                     }

                     choices.push(child.edgeLabel);
                  });

                  //choices array is now complete so we can send the question
                  builder.Prompts.choice(session, question, choices, { listStyle: builder.ListStyle.button, minScore: 1.0 });
               }
            }
         }
      },
      function (session, results) {
         //Create the appropriate answer object so we can add it to the answer map
         var answ;
         if (isNumeric) {
            answ = { "answer": results, "type": "numeric" };
         } else {
            answ = { "answer": results, "type": "categorical" };
         }

         //add it to the map
         var answerMap = session.userData.answerMap;
         console.log("DEBUG [150]: " + session.userData.answerMap);
         console.log("DEBUG [150]: " + session.userData.node);
         var nodeLab = session.userData.node.label;
         answerMap[nodeLab] = answ;

         //We now have the choice the user made in the current subtree
         manageAnswer(session, results);
      }
   ]);
}


function manageAnswer(session, results) {

   //console.log("DEBUG: inside manage answer with question " + session.userData.node.label + " and answer re")
   //If it is numeric we have to perform the actual comparison to choose the branch
   //otherwise, we just compare the labels

   if (isNumeric) {

      session.userData.node.children.forEach(function (child) {

         if (child.edgeLabel.includes('<=')) {
            //parsing value from the edge label
            var val = parseFloat(child.edgeLabel.replace(/<=\s*/g, ''));

            if (results.response <= val) { //comparing user's value with label one and the given operator
               session.userData.node = child;
               isNumeric = false;
               session.replaceDialog("traverseTree");
            }


         } else {
            //parsing value from the edge label
            var val = parseFloat(child.edgeLabel.replace(/>\s*/g, ''));

            if (results.response > val) { //comparing user's value with label one and the given operator
               session.userData.node = child;
               isNumeric = false;
               session.replaceDialog("traverseTree");
            }
         }
      });
   }
   else {
      session.userData.node.children.forEach(function (child) {

         if (child.edgeLabel == results.response.entity) {
            session.userData.node = child;
            session.replaceDialog("traverseTree");
         }
      });
   }
}


function extract_answers(questionsFile) {

   //read questions file
   questions = fs.readFileSync(questionsFile);
   //parse the file
   var questionAndAnswers = JSON.parse(questions);
   
   //Now, if the questions file has the questions object
   if(questionAndAnswers.hasOwnProperty("questions")){
      var q = questionAndAnswers.questions;
      for(var key in q)
         questionsList.set(key, q[key]);
      
   }

   //And now let's do the same for the answers
   if(questionAndAnswers.hasOwnProperty("answers")){
      var a = questionAndAnswers.answers;
      for(var key in a){
         answerList.set(key, a[key]);
      }
   }

}