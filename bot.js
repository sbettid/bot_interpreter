var restify = require('restify'); //used to create the rest service 
var builder = require('botbuilder'); //used to create the bot connector
const fs = require('fs'); //used to read the JSON input file

//Reading console arguments
const args = process.argv.slice(2)

//Reading the content of the file
var rawdata = fs.readFileSync(args[0]);

//Parsing it using the JSON parser
var currentNode = JSON.parse(rawdata);

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

var inMemoryStorage = new builder.MemoryBotStorage(); //TODO check what the hell is this

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
            var reply = new builder.Message().address(message.address).text("Hi! I am a bot and now I will try to help you! Whenever you are ready, tyope something so we can start :)");
            bot.send(reply);
         }
      });
   }
});



var choices;
var isNumeric = false;

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
         
         //TODO dump variables from the list
         console.log("-------DUMP VARIABLE START-------");
         console.log(session.userData.answerMap);
         console.log("-------DUMP VARIABLE END-------");

         //Print conclusion and end conversation
         session.send("My conclusion is: " + node.label);
         session.endConversation("Bye, it has been a pleasure!");
      } else {
        
         //otherwise we check if we already know the answer before sending the question
         if (answerMap.hasOwnProperty(node.label)) { //if we know the answer we just jump to the right branch
            var nodeLab = node.label;
            var answ = answerMap[nodeLab]; //initialize with the answer
           
            console.log("answer is " + answ);

            if(answ["type"] == "numeric"){
               isNumeric = true;
            }

            manageAnswer(session, answ["answer"] ); //directly jump to the right branch
        
         } else { //otherwise we send the question

            var question = "What is the value of " + node.label; //question
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
       if(isNumeric){
         answ = {"answer": results, "type" : "numeric"};
       } else {
         answ = {"answer": results, "type" : "categorical"};
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

function manageAnswer(session, results){
   
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