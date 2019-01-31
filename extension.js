// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const ftp = require("basic-ftp");
const fs = require("fs");
const upath = require("upath");

let rootUnix = upath.toUnix(vscode.workspace.rootPath);
let myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
let workspaceConfigFile = `${vscode.workspace.rootPath}\\.guru\\sftp.json`;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

function getUnixRelative(currentFile) {

	let currentFileUnix = upath.toUnix(currentFile);
	let currentFileUnixRelative = currentFileUnix.replace(rootUnix, "");
	return currentFileUnixRelative;

}

function uploadFile(currentFile) {

	return new Promise((resolve, reject) => {

		checkForConfig().then((config) => {
			ftpConnect(config).then((client) => {

				let currentFileUnixRelative = getUnixRelative(currentFile);
				let currentFileStream = fs.createReadStream(currentFile);
		
				client.upload(currentFileStream, config.remote + currentFileUnixRelative).then(() => {
					client.close();
					resolve();
				}).catch((err) => {
					client.close();
					reject(err);
				});
			}).catch(reject);
		}).catch(reject);

	});

}

function downloadFile(currentFile) {

	return new Promise((resolve, reject) => {

		checkForConfig().then((config) => {

			console.log(config);
			ftpConnect(config).then((client) => {
				
				let currentFileStream = fs.createWriteStream(currentFile);
				console.log(currentFile);

				let currentFileUnix = upath.toUnix(currentFile);
				let currentFileUnixRelative = currentFileUnix.replace(rootUnix, "");

				client.download(currentFileStream, config.remote + currentFileUnixRelative).then(() => {
					console.log("done!");
					client.close();
					resolve();
				}).catch((err) => {
					console.log("err!: ", err);
					client.close();
					reject(err);
				});
				
			}).catch(reject);

		}).catch(reject);

	});

}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sftp-guru" is now active!');

	let uploadCommand = vscode.commands.registerCommand("extension.uploadFile", (args) => {
		let file = getInvokedFile(args);
		updateStatusBarItem(file, "uploading ...");
		uploadFile(file).then(() => {
			updateStatusBarItem(file, "uploaded.");
		}).catch((err) => {
			updateStatusBarItem(file, "error while uploading." + ("message" in err ? err.message : ""));
			handleError(err);
		});
	});

	context.subscriptions.push(uploadCommand);

	let downloadCommand = vscode.commands.registerCommand("extension.downloadFile", (args) => {
		let file = getInvokedFile(args);
		updateStatusBarItem(file, "downloading ...");
		downloadFile(file).then(() => {
			updateStatusBarItem(file, "downloaded.");
		}).catch((err) => {
			updateStatusBarItem(file, "error while downloading." + ("message" in err ? err.message : ""));
			handleError(err);
		});
	});

	context.subscriptions.push(downloadCommand);

	let editConfigCommand = vscode.commands.registerCommand("extension.editConfig", () => {
		let openConfigFileFunc = () => {
			vscode.workspace.openTextDocument(workspaceConfigFile).then((onfullfilled) => {
				vscode.window.showTextDocument(onfullfilled);
			});
		};
		checkForConfig().then(openConfigFileFunc).catch(openConfigFileFunc);
	});

	context.subscriptions.push(editConfigCommand);

	context.subscriptions.push(myStatusBarItem);
	
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
		updateStatusBarItem();
	}));
	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => {
		updateStatusBarItem();
	}));

	updateStatusBarItem();

	/*
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello VS Code!');
	});

	context.subscriptions.push(disposable);
	*/
}
exports.activate = activate;

function configExists() {
	return fs.existsSync(workspaceConfigFile);
}

function updateStatusBarItem(file = "", text = "ready") {

	if(!configExists()) {
		return;
	}
	
	myStatusBarItem.show();
	myStatusBarItem.command = "extension.uploadFile";
	let currentFile = file;
	if(!currentFile.length) {
		currentFile = vscode.window.activeTextEditor.document.fileName;
	}

	let icon = "globe";
	switch(text) {
		case "uploading ...":
			icon = "arrow-up";
			break;
		case "downloading ...":
			icon = "arrow-down";
			break;
		case "uploaded.":
		case "downloaded.":
			icon = "check";
			break;
	}
	
	let currentFileRelative = getUnixRelative(currentFile);
	myStatusBarItem.text = `$(${icon}) sftp-guru[${currentFileRelative}] ${text}`;

}

// this method is called when your extension is deactivated
function deactivate() {}

function handleError(error) {
	console.error(error);
	vscode.window.showErrorMessage(String(error));
	msg(String(error));
}

function msg(value) {
	vscode.window.showInformationMessage(value);
}

function getInvokedFile(args) {

	if(typeof args === "object") {
		if("scheme" in args) {
			if(args.scheme === "file") {
				return args.fsPath;
			}
		}
	}

	return vscode.window.activeTextEditor.document.fileName;

}

function ftpConnect(config) {

	return new Promise((resolve, reject) => {

		let client = new ftp.Client();
		client.ftp.verbose = true;

		client.access({
			"host": config.host,
			"port": config.port,
			"user": config.user,
			"password": config.password
		}).then(() => {
			resolve(client);
			console.info(`ftp connected...`);
		}).catch(reject);

	});

	

}

function checkForConfig() {

	return new Promise((resolve, reject) => {
		
		fs.readFile(workspaceConfigFile, (err, data) => {

			if(err) {

				handleError(err);
				fs.mkdirSync(`${vscode.workspace.rootPath}\\.guru`);
				fs.writeFileSync(workspaceConfigFile, JSON.stringify({
					"host": "localhost",
					"port": 21,
					"user": "",
					"password": ""
				}, null, 4));

				reject(err);

			} else {

				let dataString = data.toString();
				let dataJSON = JSON.parse(dataString);

				resolve(dataJSON);

				//console.log(config);
				//vscode.window.showInformationMessage(`done`);

			}

		});


	});

}

module.exports = {
	activate,
	deactivate
};
