# Bot - Interpreter
Bot interpreter is a Node.js application able to use a decision tree, specified in JSON, to create a local RESTful chatbot application using the [Microsoft Bot Framework](https://dev.botframework.com/). 

The application takes as input a JSON file that specifies the decision tree in the following format: 

{label: “node1”, children: [{ edgeLabel: “to_node_2”, label: node_2 }, { edgeLabel: “to_node_3”, label: “node_3”, children […]  }]}

The tree is specified in a recursive way, where each node, except the leafs, contains the list of its children nodes. Moreover, every node has a label attribute specifying its label/question and this property will be the one asked to the user, during the conversation. All nodes (beside the root) have an edgeLabel property, which rapresents the label of the edge from the parent node and, in our case, also the asnwer to the parent's question that will determine the next node in the path. 

For a complete example of a decison tree specified in such a format, please have a look at the examples/graph.json file. 

## Installation

Given its nature, Node.js is required. Moreover, the botbuilder and restify packages are required to create the local server and bot connection. All dependencies have already been specified in the package.json file, therefore you can follow this process to correctly install the application:

    1. Clone this repository or download the code as a compressed archive (and decompress it).
    2. Open a terminal or command prompt and, in the root folder of the project execute the dependency installation command 'npm install'

Furthermore, since the chatbot application will be created as a local RESTful service, you will need to connect to it in order to test it. A simple way of doing this is to install the [Bot Framework Emulator](https://github.com/Microsoft/BotFramework-Emulator/blob/master/README.md) and use it to connect to the local application.

## Usage

To start the bot interpreter, open a terminal window in the root folder of the project and execute the following command:
'node bot.js path_to_json_file' where path_to_json_file is the path to your json file specifying the decision tree.