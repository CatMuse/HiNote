import { BaseHTTPClient } from './BaseHTTPClient';
import { Notice } from 'obsidian';

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

interface OllamaChatResponse {
    message?: {
        content?: string;
    };
}

interface OllamaPullResponse {
    ok?: boolean;
    status?: number;
}

export class OllamaService {
    private baseUrl: string;

    constructor(host: string = 'http://localhost:11434') {
        // Ensure the host has a protocol and normalize the URL
        if (!host.startsWith('http://') && !host.startsWith('https://')) {
            host = 'http://' + host;
        }
        // Remove trailing slash if present
        this.baseUrl = host.replace(/\/$/, '');
    }

    async listModels(): Promise<string[]> {
        try {

            const response = await this.makeRequest<OllamaModelsResponse>({
                endpoint: '/api/tags',
                method: 'GET'
            });

            if (!response || !response.models) {
                throw new Error('Invalid API response format');
            }

            return response.models.map((model: OllamaModel) => model.name);
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async generateCompletion(model: string, prompt: string): Promise<string> {
        try {

            const response = await this.makeRequest<OllamaResponse>({
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
            throw this.handleError(error);
        }
    }

    async pullModel(modelName: string): Promise<void> {
        try {
            new Notice(`Downloading model ${modelName}...`);
            const response = await this.makeRequest<OllamaPullResponse>({
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
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to download model: ${message}`);
        }
    }

    async chat(model: string, messages: { role: string, content: string }[]): Promise<string> {
        try {

            const response = await this.makeRequest<OllamaChatResponse>({
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
            throw this.handleError(error);
        }
    }

    async testConnection(): Promise<boolean> {
        if (!this.baseUrl) {
            return false;
        }
        
        try {
            const response = await this.makeRequest<OllamaVersionResponse>({
                endpoint: '/api/version',
                method: 'GET'
            });

            return !!response?.version;
        } catch {
            return false;
        }
    }

    private async makeRequest<T = unknown>(params: {
        endpoint: string;
        method: 'GET' | 'POST';
        body?: string;
    }): Promise<T> {
        return new BaseHTTPClient().request<T>({
            url: this.baseUrl + params.endpoint,
            method: params.method,
            headers: { 'Content-Type': 'application/json' },
            body: params.body
        });
    }

    private handleError(error: unknown): Error {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('ECONNREFUSED')) {
            new Notice('Ollama service is not running. Please start the service.');
            return new Error('Unable to connect to Ollama service. Please ensure the service is running.');
        }
        if (error instanceof TypeError && message.includes('Invalid URL')) {
            return new Error(`Invalid Ollama service URL: ${this.baseUrl}`);
        }
        return error instanceof Error ? error : new Error(message);
    }

}
