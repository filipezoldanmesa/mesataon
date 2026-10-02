import type { NextConfig } from 'next';

/**
 * Protótipo: roda sempre na raiz (sem basePath) e sem `output: 'standalone'`,
 * porque não é implantado atrás do ALB de produção. O `withBasePath` continua
 * no código das telas — ele é no-op aqui e obrigatório em produção, então tela
 * nova DEVE usá-lo mesmo assim (é o que deixa o port ser cópia direta).
 */
const nextConfig: NextConfig = {};

export default nextConfig;
