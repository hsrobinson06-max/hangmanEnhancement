import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const app = express();
app.use(cors());
app.use(express.json());

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
  },
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'Players';

async function initTable(retries = 10) {
    for (let i = 0; i < retries; i++) {
      try {
        await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
        console.log('Players table already exists.');
        return;
      } catch (err) {
        if (err.name === 'ResourceNotFoundException') {
          const params = {
            TableName: TABLE_NAME,
            KeySchema: [{ AttributeName: 'playerID', KeyType: 'HASH' }],
            AttributeDefinitions: [
              { AttributeName: 'playerID', AttributeType: 'S' },
              { AttributeName: 'playerName', AttributeType: 'S' },
            ],
            GlobalSecondaryIndexes: [
              {
                IndexName: 'PlayerNameIndex',
                KeySchema: [{ AttributeName: 'playerName', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
              },
            ],
            ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
          };
          await client.send(new CreateTableCommand(params));
          console.log('Created Players table with PlayerNameIndex GSI');
          return;
        }
        console.log('Waiting for DynamoDB to start...');
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
  }

app.post('/api/players', async (req, res) => {
  try {
    const { playerName } = req.body;
    if (!playerName) {
      return res.status(400).json({ error: 'playerName is required' });
    }

    const newPlayer = {
      playerID: uuidv4(),
      playerName: playerName.trim(),
      wins: 0,
      losses: 0,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: newPlayer,
      })
    );

    res.status(201).json(newPlayer);
  } catch (error) {
    console.error('POST error:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

app.get('/api/players', async (req, res) => {
  try {
    const { playerName } = req.query;
    if (!playerName) {
      return res.status(400).json({ error: 'playerName query parameter is required' });
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PlayerNameIndex',
        KeyConditionExpression: 'playerName = :name',
        ExpressionAttributeValues: {
          ':name': playerName.trim(),
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(result.Items[0]);
  } catch (error) {
    console.error('GET error:', error);
    res.status(500).json({ error: 'Failed to query player' });
  }
});

app.put('/api/players/:playerID', async (req, res) => {
  try {
    const { playerID } = req.params;
    const { wins, losses } = req.body;

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { playerID },
        UpdateExpression: 'SET wins = :w, losses = :l',
        ExpressionAttributeValues: {
          ':w': wins,
          ':l': losses,
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    res.json(result.Attributes);
  } catch (error) {
    console.error('PUT error:', error);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

const PORT = process.env.PORT || 5000;
initTable().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
