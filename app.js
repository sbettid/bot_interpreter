var restify = require('restify'); //used to create the rest service 
var builder = require('botbuilder'); //used to create the bot connector
const fs = require('fs'); //used to read the JSON input file
var program = require('commander'); //used to parse console arguments and display help

//By default we are not using questions from an external file
var questionsList = new Map(); //questions
var answerList = new Map(); //answers


const readline = require('readline');

const rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
});


var pjson = require('./package.json');
program.version(pjson.version, '-v, --version'); // set the program version to the one available in POM

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
         session.privateConversationData.node = currentNode;
         session.privateConversationData.isNumeric = false;
         session.privateConversationData.answerMap = {};
         session.privateConversationData.choices = undefined;
         session.beginDialog("traverseTree");
      }]).set('storage', inMemoryStorage); // Register in-memory storage ;

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

         var node = session.privateConversationData.node;
         var answerMap = session.privateConversationData.answerMap;

         //if the current label does not have the label property there is an error with the JSON
         if (!node.hasOwnProperty('label')) {

            console.log("ERROR: A node does not have the label property"); //print error message on the console

            //Return generic error message and end the conversation
            session.endConversation("There has been a problem with my decision strategy. Please refer to the terminal logs");
         }

         //if the node does not have any children we send the user the conclusion/last message, we dump the
         // variable states to the console and we terminate
         if (!node.hasOwnProperty('children')) {

            //Print conclusion and end conversation
            //We first check if the conclusion can be found in the questions file
            var conclusion = "My conclusion is: " + node.label;
            
            answerList.forEach(function(val, key, map){
               if(node.label.includes(key)){
                  conclusion = val;
                  console.log("I found " + val + " as corresponding conclusion");
               }
            });
            
			var conclusionObj = {"value" : conclusion};
			var conclusionLabel = "BOT_CONCLUSION_" + session.message.address.conversation.id;
			session.privateConversationData.answerMap[conclusionLabel] = conclusionObj;

			//The we add it to the answer map and we dump all the variables
			  //dump variables from the list
            console.log("-------DUMP VARIABLE START-------");
            console.log(JSON.stringify(session.privateConversationData .answerMap, null, "\t"));
            console.log("-------DUMP VARIABLE END-------");

            //clean the answer map
            session.privateConversationData .answerMap = {};
            
			//send the conclusion to the user and end conversation
			session.send(conclusion);
            session.endConversation("Bye, it has been a pleasure!");
         } else {

            //otherwise we check if we already know the answer before sending the question
            if (answerMap.hasOwnProperty(node.label)) { //if we know the answer we just jump to the right branch
               var nodeLab = node.label;
               var answ = answerMap[nodeLab]; //initialize with the answer

               console.log("answer is " + answ);

               if (answ["type"] == "numeric") {
                  session.privateConversationData .isNumeric = true;
               }

               manageAnswer(session, answ); //directly jump to the right branch

            } else { //otherwise we send the question

               //We check if we are using the questions file or the default mode
               var question;
               var retrievedQuestionNode = questionsList.get(node.label);
               var retrievedQuestion;
               if(retrievedQuestionNode != undefined && retrievedQuestionNode.hasOwnProperty('question'))
                  retrievedQuestion = retrievedQuestionNode.question;
               else
                  retrievedQuestion = undefined;

               //console.log("retrievedQuestion is " + retrievedQuestion + " after looking for " + node.label);
               if (program.questions && retrievedQuestion != undefined) {
                  question = retrievedQuestion;
               }
               else
                  question = "What is the value of " + node.label; //question

                //Prepare regular expression to check question type
				var greaterRegEx = RegExp('^>');
				var smallerRegEx = RegExp('^<=');

               //check type of question, is it a numeric/nominal answer?
               if (node.children[0].hasOwnProperty('edgeLabel') && (smallerRegEx.test(node.children[0].edgeLabel) || greaterRegEx.test(node.children[0].edgeLabel))) {

                  session.privateConversationData .isNumeric = true; //mark the question as numeric  

                  builder.Prompts.number(session, question); //show the prompt to the user

               } else {

                  //add to choices and correspondence map the options the user has
                  session.privateConversationData.optionsMap = {};
                  session.privateConversationData.choices = []; //answer array
                  
				  var entries = [];

                  if(retrievedQuestionNode != undefined && retrievedQuestionNode.hasOwnProperty('values')){ //if we have the values of the question
                     
                     //We will store all the keys we find in the external file so we can check if we will miss something
                    for(var key in retrievedQuestionNode.values){ //let's add every option that has been provided with the question
                     session.privateConversationData.optionsMap[retrievedQuestionNode.values[key]] =  key;
                     session.privateConversationData.choices.push(retrievedQuestionNode.values[key]);

                     entries.push(key); //we keep the ones found in array for a later comparison
                    }
                  }
                  
                  console.log("Entries");
                  console.log(entries);
                  //and now add all the options that have not been provided, if any
                  node.children.forEach(function (child) { //for each child

                     //if the child does not have the edgeLabel property there is an error in the JSON file
                     if (!child.hasOwnProperty('edgeLabel')) {
                        console.log("ERROR: A child node does not have the edgeLabel property"); //print error message on the console
                        //Return generic error message and end the conversation
                        session.endConversation("There has been a problem with my decision strategy. Please refer to the terminal logs");
                     }

                     //If this entry was not found in the external file
                     if(! entries.includes(child.edgeLabel) ){
                        console.log(child.edgeLabel + " was not provided in the JSON file");
                        session.privateConversationData.choices.push(child.edgeLabel); //we add it, so that we do not miss anything
                        session.privateConversationData.optionsMap[child.edgeLabel] = child.edgeLabel;
                     }
                  });
                  session.privateConversationData.testData = entries;
                  console.log("Before sending " + JSON.stringify(session.privateConversationData.optionsMap));
                  //choices array is now complete so we can send the question
                  builder.Prompts.choice(session, question, session.privateConversationData.choices, { listStyle: builder.ListStyle.button, minScore: 1.0 });
               }
            }
         }
      },
      function (session, results) {
         //Create the appropriate answer object so we can add it to the answer map
         var answ;
         if (session.privateConversationData.isNumeric) {
            answ = { "value": results.response, "type": "numeric" };
         } else {
            console.log("Map is " + JSON.stringify(session.privateConversationData.optionsMap));
            var branchLabel = session.privateConversationData.optionsMap[results.response.entity];
            answ = { "value": branchLabel, "type": "categorical" };
         }

         //add it to the map
         var answerMap = session.privateConversationData.answerMap;
         console.log("DEBUG [150]: " + session.privateConversationData.answerMap);
         console.log("DEBUG [150]: " + session.privateConversationData.node);
         var nodeLab = session.privateConversationData.node.label;
         answerMap[nodeLab] = answ;

         //We now have the choice the user made in the current subtree
         manageAnswer(session, answ);
      }
   ]);
}


function manageAnswer(session, answer) {

   //If it is numeric we have to perform the actual comparison to choose the branch
   //otherwise, we just compare the labels

   if (session.privateConversationData.isNumeric) {

      session.privateConversationData.node.children.forEach(function (child) {

         if (child.edgeLabel.includes('<=')) {
            //parsing value from the edge label
            var val = parseFloat(child.edgeLabel.replace(/<=\s*/g, ''));

            if (answer["value"] <= val) { //comparing user's value with label one and the given operator
               session.privateConversationData.node = child;
               session.privateConversationData.isNumeric = false;
               session.replaceDialog("traverseTree");
            }


         } else {
            //parsing value from the edge label
            var val = parseFloat(child.edgeLabel.replace(/>\s*/g, ''));

            if (answer["value"] > val) { //comparing user's value with label one and the given operator
               session.privateConversationData.node = child;
               session.privateConversationData.isNumeric = false;
               session.replaceDialog("traverseTree");
            }
         }
      });
   }
   else {
      
      //change response entity to valore corrispondente
      
      session.privateConversationData.node.children.forEach(function (child) {

         if (child.edgeLabel == answer["value"]) {
			console.log("Answer value is " + answer["value"]);
            session.privateConversationData.node = child;
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
      for(var key in q){
         questionsList.set(key, q[key]);
         
      }
   }

   //And now let's do the same for the answers
   if(questionAndAnswers.hasOwnProperty("answers")){
      var a = questionAndAnswers.answers;
      for(var key in a){
         answerList.set(key, a[key]);
      }
   }

}