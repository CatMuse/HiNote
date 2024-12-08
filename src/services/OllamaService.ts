import { requestUrl, Notice } from 'obsidian';

interface OllamaResponse {
    response: string;
    error?: string;
}

interface OllamaModel {
    name: string;
    modified_at: string;
    size: number;
}

interface OllamaModelsResponse {
    models: OllamaModel[];
}

interface OllamaVersionResponse {
    version: string;
}

export class OllamaService {
    private retryAttempts = 3;
    private retryDelay = 1000; // ms
    private baseUrl: string;

    constructor(host: string = 'http://localhost:11434') {
        // Ensure the host has a protocol and normalize the URL
        if (!host.startsWith('http://') && !host.startsWith('https://')) {
            host = 'http://' + host;
        }
        // Remove trailing slash if present
        this.baseUrl = host.replace(/\/$/, '');
        console.log('Initialized OllamaService with base URL:', this.baseUrl);
    }

    async listModels(): Promise<string[]> {
        try {
            await this.ensureConnection();

            const response = await this.makeRequest({
                endpoint: '/api/tags',
                method: 'GET'
            }) as OllamaModelsResponse;

            console.log('Models response:', response);

            if (!response || !response.models) {
                throw new Error('Invalid API response format');
            }

            return response.models.map((model: OllamaModel) => model.name);
        } catch (error) {
            console.error('Failed to fetch models:', error);
            throw this.handleError(error);
        }
    }

    async generateCompletion(model: string, prompt: string): Promise<string> {
        try {
            await this.ensureConnection();

            const response = await this.makeRequest({
                endpoint: '/api/generate',
                method: 'POST',
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: false
                })
            });

            if (!response || !response.response) {
                throw new Error('Invalid API response format');
            }

            return response.response;
        } catch (error) {
            console.error('Generation failed:', error);
            throw this.handleError(error);
        }
    }

    async pullModel(modelName: string): Promise<void> {
        try {
            new Notice(`Downloading model ${modelName}...`);
            const response = await this.makeRequest({
                endpoint: '/api/pull',
                method: 'POST',
                body: JSON.stringify({
                    name: modelName
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to download model: ${response.status}`);
            }

            new Notice(`Model ${modelName} downloaded successfully`);
        } catch (error) {
            console.error('Failed to pull model:', error);
            throw new Error(`Failed to download model: ${error.message}`);
        }
    }

    async chat(model: string, messages: { role: string, content: string }[]): Promise<string> {
        try {
            await this.ensureConnection();

            const response = await this.makeRequest({
                endpoint: '/api/chat',
                method: 'POST',
                body: JSON.stringify({
                    model,
                    messages,
                    stream: false
                })
            });

            if (!response || !response.message?.content) {
                throw new Error('Invalid API response format');
            }

            return response.message.content;
        } catch (error) {
            console.error('Chat failed:', error);
            throw this.handleError(error);
        }
    }

    private async ensureConnection(): Promise<void> {
        if (!this.baseUrl) {
            throw new Error('Ollama service not configured. Please set the host in settings.');
        }
        const isConnected = await this.testConnection();
        if (!isConnected) {
            throw new Error('Unable to connect to Ollama service. Please ensure the service is running.');
        }
    }

    async testConnection(): Promise<boolean> {
        if (!this.baseUrl) {
            return false;
        }
        
        try {
            const response = await this.makeRequest({
                endpoint: '/api/version',
                method: 'GET'
            });

            return !!response?.version;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    private async makeRequest(params: {
        endpoint: string;
        method: string;
        body?: string;
    }): Promise<any> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const url = new URL(params.endpoint, this.baseUrl).toString();
                console.log(`Making request to ${url} (attempt ${attempt}/${this.retryAttempts})`);
                
                const response = await requestUrl({
                    url,
                    method: params.method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: params.body,
                    throw: false
                });

                console.log('Response status:', response.status);
                console.log('Response headers:', response.headers);
                console.log('Response body:', response.text);

                if (response.status === 200) {
                    try {
                        // Some Ollama endpoints might return empty responses
                        if (!response.text) {
                            return {};
                        }

                        // Try to parse as JSON
                        const jsonResponse = JSON.parse(response.text);
                        return jsonResponse;
                    } catch (e) {
                        console.error('Failed to parse JSON response:', e);
                        console.error('Response text:', response.text);
                        throw new Error('Invalid JSON response from server');
                    }
                }

                // Handle non-200 responses
                let errorMessage = `HTTP error! status: ${response.status}`;
                try {
                    const errorJson = JSON.parse(response.text);
                    if (errorJson.error) {
                        errorMessage = errorJson.error;
                    }
                } catch (e) {
                    // If we can't parse the error as JSON, use the raw text
                    if (response.text) {
                        errorMessage = response.text;
                    }
                }
                throw new Error(errorMessage);
            } catch (error) {
                console.error(`Request failed (attempt ${attempt}):`, error);
                lastError = error;
                if (attempt < this.retryAttempts) {
                    await this.delay(this.retryDelay * attempt);
                    continue;
                }
                break;
            }
        }

        throw lastError;
    }

    private handleError(error: any): Error {
        if (error.message.includes('ECONNREFUSED')) {
            new Notice('Ollama service is not running. Please start the service.');
            return new Error('Unable to connect to Ollama service. Please ensure the service is running.');
        }
        if (error instanceof TypeError && error.message.includes('Invalid URL')) {
            return new Error(`Invalid Ollama service URL: ${this.baseUrl}`);
        }
        return error;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}