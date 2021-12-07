const { convertFactory } = require("@graphql-codegen/visitor-plugin-common");

const OperationType = {
  query: "query",
  mutation: "mutation"
};

const VariableKind = {
  NAMED_TYPE: "NamedType",
  LIST_TYPE: "ListType",
  NON_NULL_TYPE: "NonNullType"
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
      ...input.options{{variables}}
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
      ...input.options{{variables}}
    })
  ).{{dataName}};
};
`;

const mutationInputTemplate = `input: { 
  client?: ApolloClient<T>,
  options?: Omit<MutationOptions, 'mutation' | 'variables'>{{variables}} 
}{{variableUndefined}}`;

const variableTypeTemplate = `{{inputName}}{{nullable}}: {{inputType}}`;

const scalars = {
  ID: "string",
  String: "string",
  Boolean: "boolean",
  Int: "number",
  Float: "number",
  DateTime: "string",
  JSON: "any",
  JSONObject: "any"
};

function clearOptional(str) {
  const rgx = new RegExp(`^Maybe<(.*?)>$`, "i");
  if (str.startsWith(`Maybe`)) {
    return str.replace(rgx, "$1");
  }
  return str;
}

function wrapTypeNodeWithModifiers(typeNode, convert) {
  switch (typeNode?.kind) {
    case VariableKind.NAMED_TYPE: {
      return `Maybe<${scalars[typeNode.name.value] || convert(`${typeNode.name.value}`)}>`;
    }
    case VariableKind.NON_NULL_TYPE: {
      const innerType = wrapTypeNodeWithModifiers(typeNode.type, convert);
      return clearOptional(innerType);
    }
    case VariableKind.LIST_TYPE: {
      const innerType = wrapTypeNodeWithModifiers(typeNode.type, convert);
      return `Maybe<Array<${innerType}> | ${innerType}>`;
    }
  }
  return wrapTypeNodeWithModifiers(typeNode?.type, convert);
}

function generateVariables(inputNames) {
  let variables = "  variables: {";
  inputNames.forEach((inputName, i) => {
    const nullable = `${inputName.type.kind != VariableKind.NON_NULL_TYPE ? "?" : ""}`;

    variables += `\n    ${replaceTemplate(variableTypeTemplate, { ...inputName, nullable })}`;
    if (i < inputNames.length - 1) {
      variables += ",";
    }
  });
  variables += "\n  }";
  return variables;
}

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
      const inputNames = (definition.variableDefinitions ?? [])
        .map((vd) => {
          const inputName = vd.variable.name?.value;
          const inputType = wrapTypeNodeWithModifiers(vd.type, convert);
          return { inputName, inputType, type: vd.type };
        })
        .filter((x) => x.inputName && x.inputType);

      const hasVariables = inputNames && inputNames.length > 0;
      const variables = hasVariables ? ",\n      variables: input.variables" : "";
      const variableUndefined = hasVariables ? "" : " = {}";
      const queryVariables = { name, typeName, dataName, variables };

      if (definition.operation === OperationType.query) {
        const inputType = replaceTemplate(queryInputTemplate, {
          variableUndefined,
          variables: hasVariables ? `,\n${generateVariables(inputNames)}` : ""
        });
        contents.push(replaceTemplate(queryTemplate, { ...queryVariables, inputType }));
      }

      if (definition.operation === OperationType.mutation) {
        const inputType = replaceTemplate(mutationInputTemplate, {
          variableUndefined,
          variables: hasVariables ? `,\n${generateVariables(inputNames)}` : ""
        });
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
