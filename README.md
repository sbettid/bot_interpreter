# Bot - Interpreter
Bot Interpreter is a Node.js application able to use a decision tree, specified in JSON, to create a local RESTful chatbot application using the [Microsoft Bot Framework](https://dev.botframework.com/). It has been developed as part of a Bachelor thesis project involving the creation of a classification chatbot. 

The application takes as input a JSON specification of the decision tree in the following format: 

`{label: “node1”, children: [{ edgeLabel: “to_node_2”, label: node_2 }, { edgeLabel: “to_node_3”, label: “node_3”, children […]  }]}`

The tree is specified in a recursive way, where each node, except the leafs, contains the list of its children nodes. Moreover, every node has a label attribute specifying the attribute used to split the data at the node or, in case of a leaf, the conclusion reached. All nodes (beside the root) have an edgeLabel property, which rapresents the label of the edge from the parent node and, in our case, also the answer to the parent's question that will determine the next node in the path. 

For a complete example of a decison tree specified in such a format, please have a look at the [examples/test_tree.json](examples/test_tree.json) file, which represent the following classification tree used to take the decision of playing tennis based on the weather:

![Graphical representation of the tree](examples/tree_test.jpg)


Moreover, a tree that can be used as input can be generated and exported using the complementary software for the creation of decision tree starting from a dataset, always part of the thesis, that can be found [at this address](https://gitlab.inf.unibz.it/Davide.Sbetti/customj48);

The tree JSON specification can be provided using STDIN after the software has been launched, or as a file parameter (related examples available in the [Usage section](#usage). 

Moreover, a JSON questions file can be used to specify (using the appropriate parameter), for each different node's label, the question that should be asked to the user and the possible answers and, for leaf nodes, the desired message that we would like to return.  

The questions file contains a JSON object with up to two distinct objects defining questions and answers. Each question is an object, identified by its label, containing a question attribute with the related message and, if the question is categorical, a values array containing possible answers with a personalized message. For final answers (corresponding to leafs), the label can also be specified partially, since the interpreter applies a "contains" strategy to find the correct message for a given leaf. This is particularly helpful if in the tree the label is followed by a number (generally representing the number of instances reaching the node).

All attributes in the file can be specified partially: we can also personalize only the question message or only the answers messages (also partially). The same approach can be used for conclusions, not all of them must be specified. In case the interpreter finds a missing question/answer/conclusion, it will simply use a default message.

 The following file is the representation of possible questions (with the answers of the humidity question missing) associated with the tree presented before and available in the [examples/test_questions.json](examples/test_questions.json) file: 

```
{
    "questions": {
     "outlook" : {
         "question": "What's the weather like?",
         "values" : {
             "sunny" : "The sun is shining",
            
             "rainy" : "It is currently raining"
         }
     },
     "humidity" : { "question" : "How's humidity?"},
     "windy" : {
         "question" : "Is it windy?",
         "values" : {
             "TRUE" : "It is",
             "FALSE" : "No wind so far"
         }
     }
    }, 
    "answers" : {
        "yes" : "There are perfect weather conditions to play! Have fun :)",
        "no" : "I suggest you to relax today, weather conditions could make the game difficult"
    }
 }
```


## Features

The application is a simple chatbot interpreter. It allows the traversal of a given decision tree, asking the user a question every time it reaches a new node. Questions can be customized using an external file, as pointed out in the previous section. If the question is a categorical one and therefore the number of possible asnwers is fixed, the chatbot will send the question along with the options as clickable buttons.

On the other hand, if the question requires a numerical answer, the user is able to send freely every possible number as answer and the bot will then handle it appropriately. 

The application remembers every question and answer it has asked previously as a pair, in order to avoid asking multiple times the same question, if it appears more than once in the tree. In that case, the chatbot will use the previous stored value as answer. 

When a leaf node is reached, the application will send the user the final conclusion/value and will then terminate, dumping on the console window all question/answer pairs used in the conversation.

## Installation

Given its nature, Node.js is required. Moreover, the botbuilder, commander and restify packages are required to create the local server, the bot connection and to manage arguments. All dependencies have already been specified in the package.json file, therefore you can follow this process to correctly install the application using just a simple command:

    1. Clone this repository or download the code as a compressed archive (and decompress it).
    2. Open a terminal or command prompt and, in the root folder of the project execute the dependency installation 
    command `npm install`

Furthermore, since the chatbot application will be created as a local RESTful service, you will need to connect to it in order to test it. A simple way of doing this is to install the [Bot Framework Emulator](https://github.com/Microsoft/BotFramework-Emulator/blob/master/README.md) and use it to connect to the local application.

## Usage

Bot Interpreter is CLI that accepts as input the JSON specification of a decision tree and/or the following options: 

```
Options:
  -V, --version                output the version number
  -t, --tree <file_path>       file path to the exported json decision tree
  -q, --questions <file_path>  file path to the question specification file
  -h, --help                   output usage information
  ```

For example, we can use one of the sample graphs provided with the tool and its questions file to test our bot, running the following command in the root folder of the project:

`node app.js - t examples/test_tree.json -q examples/test_questions.json`


We can also pass the JSON specification directly in the console using STDIN without specifying any option. The ideal usage of this feature is to combine it with our CustomJ48 extension of the J48 algorithm of the Weka library. In this way, the two commands can be specified so that they can be piped together to create directly the chatbot starting from an example file.

After the bot application has started, we can connect to it and start chatting!
The application will dump on the console the address and port used on the local machine and that can be used for the connection. 

If you are using, as suggested, the Bot Framework Emulator, it is possible to simply connect to the application using a chat-fashion interface and then save the configuration to a file for faster future connections. 

By default, the Emulator will be able to access the chatbot application at the following address: 

`http://localhost:3978/api/messages`

Note: the port number could vary depending on the available ports of your machine

## License

The code for this Node.js application is distributed under the MIT license, please check the [LICENSE](LICENSE) file for more information. 