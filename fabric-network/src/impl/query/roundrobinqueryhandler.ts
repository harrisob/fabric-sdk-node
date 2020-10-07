/*
 * Copyright 2018, 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricError } from '../../errors/fabricerror';
import { QueryHandler } from './queryhandler';
import { Query } from './query';

import { Endorser } from 'fabric-common';

import util = require('util');

import * as Logger from '../../logger';
const logger = Logger.getLogger('RoundRobinQueryHandler');

export class RoundRobinQueryHandler implements QueryHandler {
	private readonly peers: Endorser[];
	private currentPeerIndex = 0;

	constructor(peers: Endorser[]) {
		logger.debug('constructor: peers=%j', peers.map((peer) => peer.name));
		this.peers = peers;
	}

	async evaluate(query: Query) {
		const method = 'evaluate';
		logger.debug('%s - start', method);

		const startPeerIndex = this.currentPeerIndex;
		this.currentPeerIndex = (this.currentPeerIndex + 1) % this.peers.length;
		const errorMessages = [];

		for (let i = 0; i < this.peers.length; i++) {
			const peerIndex = (startPeerIndex + i) % this.peers.length;

			const peer = this.peers[peerIndex];

			if (peer.hasChaincode(query.query.chaincodeId)) {
				logger.debug('%s - sending to peer %s', method, peer.name);
				const results = await query.evaluate([peer]);
				const result = results[peer.name];
				if (result instanceof Error) {
					errorMessages.push(result.toString());
				} else {
					if (result.isEndorsed) {
						logger.debug('%s - return peer response status: %s', method, result.status);
						return result.payload;
					} else {
						logger.debug('%s - throw peer response status: %s message: %s', method, result.status, result.message);
						throw Error(result.message);
					}
				}
			} else {
				const msg = util.format('Peer %s is not running chaincode %s', peer.name, query.query.chaincodeId);
				logger.debug('%s - skipping peer,  %s', method, msg);
				errorMessages.push(msg);
			}
		}

		const message = util.format('Query failed. Errors: %j', errorMessages);
		const error = new FabricError(message);
		logger.error('evaluate:', error);
		throw error;
	}
}
