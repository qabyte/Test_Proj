// openApiUtils.js

// Extract all available endpoints and their methods
export const getAvailableEndpoints = (openApiSpec) => {
  const endpoints = {};
  
  Object.entries(openApiSpec.paths || {}).forEach(([path, methods]) => {
    endpoints[path] = {
      methods: Object.keys(methods).map(m => m.toUpperCase()),
      parameters: methods.parameters || [],
      description: methods.description || ''
    };
    
    // Get method-specific details
    Object.entries(methods).forEach(([method, details]) => {
      if (method !== 'parameters') {  // Skip common parameters
        endpoints[path][method] = {
          summary: details.summary || '',
          description: details.description || '',
          parameters: [...(methods.parameters || []), ...(details.parameters || [])],
          requestBody: details.requestBody || null,
          responses: details.responses || {},
          security: details.security || []
        };
      }
    });
  });
  
  return endpoints;
};

// Get request parameters for an endpoint
export const getRequestParameters = (openApiSpec, path, method) => {
  const pathObj = openApiSpec.paths[path];
  if (!pathObj) {
    throw new Error(`Path ${path} not found`);
  }

  const methodObj = pathObj[method.toLowerCase()];
  if (!methodObj) {
    throw new Error(`Method ${method} not found for path ${path}`);
  }

  // Combine path-level and method-level parameters
  const parameters = [
    ...(pathObj.parameters || []),
    ...(methodObj.parameters || [])
  ];

  // Group parameters by type
  return {
    path: parameters.filter(p => p.in === 'path'),
    query: parameters.filter(p => p.in === 'query'),
    header: parameters.filter(p => p.in === 'header'),
    cookie: parameters.filter(p => p.in === 'cookie')
  };
};

// Get request body schema
export const getRequestBodySchema = (openApiSpec, path, method) => {
  const methodObj = openApiSpec.paths[path]?.[method.toLowerCase()];
  if (!methodObj?.requestBody?.content) {
    return null;
  }

  return {
    required: methodObj.requestBody.required || false,
    contentTypes: Object.keys(methodObj.requestBody.content),
    schema: methodObj.requestBody.content['application/json']?.schema || null
  };
};

// Generate TypeScript interfaces from schemas
export const generateTypeScriptInterfaces = (openApiSpec) => {
  const interfaces = [];

  const generateInterface = (schema, name) => {
    if (!schema || !schema.type) return '';

    if (schema.type === 'object' && schema.properties) {
      const properties = Object.entries(schema.properties)
        .map(([prop, propSchema]) => {
          let type = '';
          if (propSchema.$ref) {
            type = propSchema.$ref.split('/').pop();
          } else if (propSchema.type === 'array') {
            const itemType = propSchema.items.$ref ? 
              propSchema.items.$ref.split('/').pop() : 
              propSchema.items.type;
            type = `${itemType}[]`;
          } else {
            type = propSchema.type;
          }
          
          const optional = !schema.required?.includes(prop);
          return `  ${prop}${optional ? '?' : ''}: ${type};`;
        })
        .join('\n');

      return `interface ${name} {\n${properties}\n}\n`;
    }
    
    return '';
  };

  // Generate interfaces from components/schemas
  Object.entries(openApiSpec.components?.schemas || {}).forEach(([name, schema]) => {
    const interfaceStr = generateInterface(schema, name);
    if (interfaceStr) {
      interfaces.push(interfaceStr);
    }
  });

  return interfaces.join('\n');
};

// Generate API client code
export const generateApiClient = (openApiSpec) => {
  const endpoints = getAvailableEndpoints(openApiSpec);
  
  let clientCode = `
import axios from 'axios';

export class ApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  private async request<T>(
    method: string,
    path: string,
    params: Record<string, any> = {},
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const response = await axios({
      method,
      url: \`\${this.baseUrl}\${path}\`,
      params,
      data: body,
      headers: { ...this.headers, ...headers }
    });
    return response.data;
  }
`;

  // Generate methods for each endpoint
  Object.entries(endpoints).forEach(([path, data]) => {
    Object.entries(data).forEach(([method, details]) => {
      if (method === 'methods' || method === 'parameters') return;

      const methodName = `${method.toLowerCase()}${path
        .split('/')
        .filter(Boolean)
        .map(s => s[0].toUpperCase() + s.slice(1))
        .join('')}`;

      clientCode += `
  async ${methodName}(
    params: Record<string, any> = {},
    body?: any,
    headers: Record<string, string> = {}
  ) {
    return this.request(
      '${method.toUpperCase()}',
      '${path}',
      params,
      body,
      headers
    );
  }
`;
    });
  });

  clientCode += '}\n';
  return clientCode;
};

// Security scheme analysis
export const analyzeSecuritySchemes = (openApiSpec) => {
  const schemes = openApiSpec.components?.securitySchemes || {};
  const analysis = {
    authTypes: new Set(),
    endpoints: {
      secured: [],
      unsecured: []
    },
    schemes: {}
  };

  // Analyze security schemes
  Object.entries(schemes).forEach(([name, scheme]) => {
    analysis.authTypes.add(scheme.type);
    analysis.schemes[name] = {
      type: scheme.type,
      description: scheme.description || '',
      requirements: []
    };
  });

  // Analyze endpoint security
  Object.entries(openApiSpec.paths || {}).forEach(([path, methods]) => {
    Object.entries(methods).forEach(([method, details]) => {
      if (method === 'parameters') return;

      if (details.security && details.security.length > 0) {
        analysis.endpoints.secured.push({
          path,
          method: method.toUpperCase(),
          security: details.security
        });
      } else {
        analysis.endpoints.unsecured.push({
          path,
          method: method.toUpperCase()
        });
      }
    });
  });

  return analysis;
};

// Example usage:
const openApiSpec = {
  // Your OpenAPI spec here
};

// Get all endpoints
const endpoints = getAvailableEndpoints(openApiSpec);
console.log('Available endpoints:', endpoints);

// Get parameters for specific endpoint
const parameters = getRequestParameters(openApiSpec, '/users', 'GET');
console.log('Parameters:', parameters);

// Generate TypeScript interfaces
const interfaces = generateTypeScriptInterfaces(openApiSpec);
console.log('TypeScript interfaces:', interfaces);

// Generate API client
const clientCode = generateApiClient(openApiSpec);
console.log('API client code:', clientCode);

// Analyze security
const security = analyzeSecuritySchemes(openApiSpec);
console.log('Security analysis:', security);
