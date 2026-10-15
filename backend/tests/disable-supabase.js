// Ensure test imports can never initialize a client from a developer's .env.
process.env.NODE_ENV = 'test';
