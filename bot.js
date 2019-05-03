var restify = require('restify');
var builder = require('botbuilder');
const fs = require('fs');

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

var inMemoryStorage = new builder.MemoryBotStorage();

//Defining bot and dialogs
var bot = new builder.UniversalBot(connector, [
   function (session) {
      session.userData.node = currentNode;
      session.beginDialog("introduction");
   },
   function (session) {
      session.beginDialog("traverseTree");
   }]);

//disable persistence of conversation data
bot.set(`persistConversationData`, false);

bot.dialog("introduction", [

   function (session) {
      session.endDialog("Hello! I am a test bot and today I will try to help yoou :)");
   }
]);

var choices;
var isNumeric = false;

bot.dialog("traverseTree", [

   function (session) {

      var node = session.userData.node;

      //if the current label does not have the label property there is an error with the JSON
      if (!node.hasOwnProperty('label')) {

         console.log("ERROR: A node does not have the label property"); //print error message on the console

         //Return generic error message and end the conversation
         session.endConversation("There has been a problem with my decision strategy. Please refer to the terminal logs");
      }

      //if the node does not have any children we send the user the conclusion/last message and we terminate
      if (!node.hasOwnProperty('children')) {
         session.send("My conclusion is: " + node.label);
         session.endConversation("Bye, it has been a pleasure!");
      } else {
         //otherwise we send the user a question....

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
   },
   function (session, results) {

      //We now have the choice the user made in the current subtree
      //If it is numeric we have to perform the actual comparison to choose the branch
      //otherwise, we just compare the labels

      if(isNumeric){

         session.userData.node.children.forEach(function (child) {

            if (child.edgeLabel.includes('<=')) {
               //parsing value from the edge label
               var val = parseFloat(child.edgeLabel.replace(/<=\s*/g,''));
            
               if(results.response <= val){ //comparing user's value with label one and the given operator
                  session.userData.node = child;
                  isNumeric = false;
                  session.replaceDialog("traverseTree");
               } 

               
            } else{
               //parsing value from the edge label
               var val = parseFloat(child.edgeLabel.replace(/>\s*/g,''));
            
               if(results.response > val){ //comparing user's value with label one and the given operator
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
]);