// dependencies
import core from '@actions/core';
import fetch from 'node-fetch';
import 'dotenv/config';

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const run = async () => {
	// preflight check before starting the actions
	const serviceId = core.getInput('serviceId') || process.env.serviceId;
	if (!serviceId) {
		core.setFailed('The Service ID is missing from the workflow file');
		return;
	}

	const apiKey = core.getInput('apiKey') || process.env.apiKey;
	if (!apiKey) {
		core.setFailed('The API Key is missing from the workflow file');
		return;
	}

	try {
		let res;
		let data;

		const options = {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
		};

		// check if there is a deployment in progress, and stop
		res = await fetch(
			`https://api.render.com/v1/services/${serviceId}/deploys?limit=20`,
			{ method: 'GET', ...options }
		);
		data = await res.json();

		if (res.status !== 200) {
			core.setFailed(`This operation did not succeed. Reason: ${data.message}`);
			return;
		}

		const hasInProgressBuild = data.find(
			(instance) => instance.deploy.status === 'build_in_progress'
		)
			? true
			: false;

		if (hasInProgressBuild) {
			core.setFailed(
				'Your Render Service has an active build in progress. Wait for that to complete before deploying again'
			);
			return;
		}

		// triggering deployment
		res = await fetch(
			`https://api.render.com/v1/services/${serviceId}/deploys`,
			{ method: 'POST', ...options }
		);
		data = await res.json();

		if (res.status !== 201) {
			core.setFailed(`This operation did not succeed. Reason: ${data.message}`);
			return;
		}

		const deployId = data.id;

		// watch deployment status
		let isCompleted = false;
		let hasError = false;

		core.info('Starting deployment in Render ...');

		while (!isCompleted && !hasError) {
			res = await fetch(
				`https://api.render.com/v1/services/${serviceId}/deploys/${deployId}`,
				{ method: 'GET', ...options }
			);
			data = await res.json();

			if (res.status !== 200) {
				core.error(`An error occured. Reason: ${data.message}`);
				hasError = true;
			}

			if (data.status === 'live') {
				isCompleted = true;
			}

			res = undefined;
			data = undefined;

			await delay(5000);
		}

		if (hasError) {
			core.setFailed('Render deployment failed.');
			return;
		}

		core.info('Deployment in Render completed successfully');
	} catch (error) {
		core.setFailed(`An error occured while deploying to Render: ${error}`);
	}
};

run();
