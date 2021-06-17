const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB.DocumentClient();

/**
 * Demonstrates a simple HTTP endpoint using API Gateway. You have full
 * access to the request and response payload, including headers and
 * status code.
 *
 * To scan a DynamoDB table, make a GET request with the TableName as a
 * query string parameter. To put, update, or delete an item, make a POST,
 * PUT, or DELETE request respectively, passing in the payload to the
 * DynamoDB API as a JSON body.
 */
exports.handler = async (event, context) => {
    //console.log('Received event:', JSON.stringify(event, null, 2));

    let body;
    let statusCode = '200';
    const headers = {
        'Content-Type': 'application/json',
    };

    try {

        let requestBody = JSON.parse(event.body);

        let dbGetParams = {
            TableName: process.env.DEVICES_TBL,
            Key: {
                userId: requestBody.userID,
                id: requestBody.deviceID
            }
        };

        const device = await dynamo.get(dbGetParams).promise();

        if (device != null) {
            var valid = false;

            if (requestBody.action === 'hydrate' && device.Item.stage === 'sleeping') {
                valid = true;
                device.Item.stage = 'hydrated';
            } else if (requestBody.action === 'stop' && device.Item.stage === 'hydrated') {
                valid = true;
                device.Item.stage = 'stopping'
            }

            console.log(device);
            console.log(valid);

            if (valid === true) {
                let sqsBody = {
                    action: requestBody.action,
                    userId: requestBody.userID,
                    id: requestBody.deviceID,
                    type: 'custom widget'
                }

                let sqsParams = {
                    QueueUrl: process.env.SIMULATOR_QUEUE,
                    MessageBody: JSON.stringify(sqsBody)
                };

                let sqs = new AWS.SQS();

                const resp = await sqs.sendMessage(sqsParams).promise();

                console.log(resp);

                var putParams = {
                    TableName: process.env.DEVICES_TBL,
                    Item: device.Item
                }
                console.log(putParams);
                body = await dynamo.put(putParams).promise();
            } else {
                var msg = "device stage is not match: " + requestBody.action + ", " + device.Item.stage;
                console.log(msg);
                throw (new Error("device stage is not match"));
            }

        } else {
            console.log("device not found");
            throw (new Error("device not found"));
        }
    } catch (err) {
        statusCode = '400';
        body = err.message;
    } finally {
        body = JSON.stringify(body);
    }

    return {
        statusCode,
        body,
        headers,
    };
};
