const { convertFactory } = require("@graphql-codegen/visitor-plugin-common");

const OperationType = {
  query: "query",
  mutation: "mutation"
};

const imports = [
  "import { ApolloClient } from '@apollo/client';",
  "import { MutationOptions, QueryOptions } from '@apollo/client/core/watchQueryOptions';",
  "let __client: ApolloClient<any>;",
  `export const setDefaultApolloClient = <T = any>(client: ApolloClient<T>) => { __client = client; }`
];

const queryTemplate = `
export const {{name}} = async<T = any>({{inputType}}) => {
  return (
    await (input.client || __client).query<{{typeName}}Query, {{typeName}}QueryVariables>({
      query: {{typeName}}Document,
      ...input.options{{inputVariables}}
    })
  ).{{dataName}};
};
`;

const queryInputTemplate = `input: { 
  client?: ApolloClient<T>,
  options?: Omit<QueryOptions, 'query' | 'variables'>{{variables}} 
}{{variableUndefined}}`;

const mutationTemplate = `
export const {{name}} = async <T = any>({{inputType}}) => {
  return (
    await (input.client || __client).mutate<{{typeName}}Mutation, {{typeName}}MutationVariables>({
      mutation: {{typeName}}Document,
      ...input.options{{inputVariables}}
    })
  ).{{dataName}};
};
`;

const mutationInputTemplate = `input: { 
  client?: ApolloClient<T>,
  options?: Omit<MutationOptions, 'mutation' | 'variables'>{{variables}} 
}{{variableUndefined}}`;

function replaceTemplate(template, variables) {
  let replaced = template;
  for (const [key, value] of Object.entries(variables)) {
    replaced = replaced.replaceAll(`{{${key}}}`, value);
  }
  return replaced;
}

function plugin(schema, documents, config, info) {
  const convert = convertFactory(config);
  const contents = [];

  for (const { document } of documents) {
    for (const definition of document.definitions) {
      const name = definition.name.value;
      const typeName = convert(definition.name, { useTypesPrefix: false });
      const dataName =
        definition.selectionSet.selections.length > 1
          ? "data"
          : `data?.${definition.selectionSet.selections[0].name.value}`;
      const hasVariables =
        definition.variableDefinitions && definition.variableDefinitions.length > 0;
      const variableUndefined = hasVariables ? "" : " = {}";
      const inputVariables = hasVariables ? ",\n      variables: input.variables" : "";
      const queryVariables = { name, typeName, dataName, inputVariables };

      if (definition.operation === OperationType.query) {
        const variables = hasVariables ? `,\n  variables: ${typeName}QueryVariables` : "";
        const inputType = replaceTemplate(queryInputTemplate, { variableUndefined, variables });
        contents.push(replaceTemplate(queryTemplate, { ...queryVariables, inputType }));
      }

      if (definition.operation === OperationType.mutation) {
        const variables = hasVariables ? `,\n  variables: ${typeName}MutationVariables` : "";
        const inputType = replaceTemplate(mutationInputTemplate, { variableUndefined, variables });
        contents.push(replaceTemplate(mutationTemplate, { ...queryVariables, inputType }));
      }
    }
  }

  return {
    prepend: imports,
    content: contents.join("\n")
  };
}

module.exports = { plugin };
