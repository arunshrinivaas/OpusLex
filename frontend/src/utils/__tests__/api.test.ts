import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiUrl } from '../api.ts';

describe('Shared API URL resolver utility', () => {
    it('returns relative path when base URL is empty (Vite /api proxy mode)', () => {
        assert.equal(resolveApiUrl('/api/v1/auth/login', ''), '/api/v1/auth/login');
        assert.equal(resolveApiUrl('api/v1/auth/register', ''), '/api/v1/auth/register');
        assert.equal(resolveApiUrl('/api/v1/auth/email-otp/send', '   '), '/api/v1/auth/email-otp/send');
    });

    it('combines host base URL with endpoint path', () => {
        assert.equal(
            resolveApiUrl('/api/v1/auth/login', 'http://127.0.0.1:8000'),
            'http://127.0.0.1:8000/api/v1/auth/login'
        );
        assert.equal(
            resolveApiUrl('api/v1/auth/register', 'https://api.opuslex.com'),
            'https://api.opuslex.com/api/v1/auth/register'
        );
    });

    it('normalizes trailing slashes on base URL', () => {
        assert.equal(
            resolveApiUrl('/api/v1/auth/login', 'http://127.0.0.1:8000/'),
            'http://127.0.0.1:8000/api/v1/auth/login'
        );
        assert.equal(
            resolveApiUrl('/api/v1/auth/login', 'http://127.0.0.1:8000///'),
            'http://127.0.0.1:8000/api/v1/auth/login'
        );
    });

    it('avoids duplicate /api/v1 prefixes when base URL already ends with /api/v1', () => {
        assert.equal(
            resolveApiUrl('/api/v1/auth/login', 'http://localhost:8000/api/v1'),
            'http://localhost:8000/api/v1/auth/login'
        );
        assert.equal(
            resolveApiUrl('/api/v1/auth/register', 'http://localhost:8000/api/v1/'),
            'http://localhost:8000/api/v1/auth/register'
        );
        assert.equal(
            resolveApiUrl('/api/v1/auth/email-otp/send', 'https://staging.opuslex.com/api/v1'),
            'https://staging.opuslex.com/api/v1/auth/email-otp/send'
        );
    });

    it('avoids duplicate /api prefixes when base URL already ends with /api', () => {
        assert.equal(
            resolveApiUrl('/api/v1/auth/login', 'https://api.opuslex.com/api'),
            'https://api.opuslex.com/api/v1/auth/login'
        );
        assert.equal(
            resolveApiUrl('/api/v1/auth/login', 'https://api.opuslex.com/api/'),
            'https://api.opuslex.com/api/v1/auth/login'
        );
    });
});

