# Descrição #

Projeto que define a [Lambda Layer](https://docs.aws.amazon.com/pt_br/lambda/latest/dg/configuration-layers.html) para ser utilizada no processo de conexão com um IBM MQ 8.0+ (ainda não foi testada com a versão 7.5.0.5).

## Preparando o Ambiente de Desenvolvimento e Testes
### Instalações
É preciso ter instalado em sua máquina as seguintes tecnologias para poder atuar no projeto:
* [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)
* [npm](https://www.npmjs.com/get-npm)
* [Serverless Framework](https://www.serverless.com/framework/docs/getting-started/)
* [VS Code](https://code.visualstudio.com/Download) como IDE sugerida
* **Para Windows Apenas**
  * [Microsoft Visual Studio Build Tools 2019](https://visualstudio.microsoft.com/pt-br/downloads/)

### Configurações
Para testar o projeto em ambiente de desenvolvimento é necessário possuir configurado em sua máquina o AWS CLI, que é o client para publicar o projeto como uma stack via AWS Cloudformation. Para isso, é preciso, com o AWS CLI instalado, abra um promt de comando e digite o comando a seguir, respondendo as perguntas em seguida conforme o exemplo abaixo, conforme orientado na [documentação oficial](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html):

```bash
$ aws configure
AWS Access Key ID [None]: ********************
AWS Secret Access Key [None]: ****************************
Default region name [None]: us-east-2
Default output format [None]: json
```

Entre em contato com o time de infraestrutura para obter o **AWS Access Key ID** e o **AWS Secret Access Key** para o ambiente de desenvolvimento.

* **Para Windows Apenas**
Após as instalações da etapa anterior deve-se executar em um prompt de comando (em modo Administrativo) os seguintes comandos:
  * npm config set msvs_version 2019 --global
  * npm config set msbuild_path "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe" --global

  Observação: o referido caminho do MSBuild.exe msbuild_path pode mudar conforme a sua instalação, assim deve ser verificado primeiro onde está o arquivo MSBuild.exe

## Utilização
Este projeto é composto pelo código fonte escrito em Typescript juntamente com suas dependências e exportado para utilização tanto em projetos Typescript quanto em projetos Nodejs. Em resumo, a lib denominada **bridge_ibmmq** possui 02 (duas) classes exportadas como **default** chamadas:
* MQConnection (responsável pelo processo de conexão e desconexão com o IBM MQ alvo)
* MQQueueMessagingManager (responsável por fornecer as funcionalidades CRUD do serviço de mensageria)

Desde que haja uma conexão estabelecida com um IBM MQ, não há qualquer impedimento desta lib ser utilizada com um MQ A ou B desde que sejam respeitadas as versões testadas.

Para a realização do Build da lib para fins de teste pode-se utilizar o  ambiente Windows, assim basta no prompt de comando executarmos o seguinte comando dentro do diretório raiz do projeto:
```bash
$ npm run build:layer
```

Observação: Para a realização do Build da lib para fins de deploy, **apenas o ambiente Linux deve ser utilizado** e o comando acima deve ser executado sem que haja a presença das pastas node_modules, elas devem ser recriadas contendo o build da lib ibmmq para linux.

Para publicá-lo, com o estágio de **dev** configurado, use o comando a seguir:

```bash
$ serverless deploy --stage dev
```

Caso você queira remover a stack criada, utilize o comando:

```bash
$ serverless remove --stage dev
```

Para outras formas de utilizar o framework, consulte a [documentaçao oficial](https://www.serverless.com/framework/docs/).

Para acessar os recursos publicados é preciso acessar a conta com perfil de desenvolvimento, para isso é necessário configurar uma *role* de desenvolvimento conforme as instruções [deste documento](https://tigestao-smartbank.atlassian.net/wiki/spaces/DES/pages/135528822/Conta+AWS+DEV). Para mais informações ou dúvidas, consulte o time de infraestrutura Smartbank.

> É possível que durante a publicação do projeto haja a necessidade de instalar plugins do serverless localmente. Se isso ocorrer, basta [instalar o plugin](https://docs.npmjs.com/cli/v7/commands/npm-install) via npm. O nome do plugin necessário será retornado no prompt de comando durante o deploy caso ainda não esteja instalado em sua máquina.

## Como referenciar uma layer em seu projeto
Em seu projeto cliente de uma das layers publicadas por este projeto, considerando que este também é um projeto que utiliza o Serverless Framework, basta fazer uma configuração como esta:

```yml
# ...

functions:
  MyFunc:
    layers:
      - ${cf:bridge-ibmmq-layer-stack.BridgeIbmmqLambdaLayerQualifiedArn}
# ...
```
## Utilizando a lambda no código (NodeJS)
Para importar a lib dentro do seu código JavaScript em um lambda, utilize o modelo abaixo:

```javascript
'use strict';

const MQConnection = require('bridge_ibmmq/MQConnection')
const MQQueueMessagingManager = require('bridge_ibmmq/MQQueueMessagingManager')

exports.lambda_handler = async function(event, context, callback) {
  //Configurar os seguintes parâmetros para oder estabelecer a conexão
  let hostIp = 'hostIp'
  let hostPort = 'hostPort'
  let userId = 'userId'
  let password = 'password'
  let channelName = 'channelName'
  let queueManagerName = 'queueManagerName'
  let queueName = 'queueName'

  const mqConn = new MQConnection['default'](
    hostIp,
    hostPort,
    queueManagerName,
    channelName,
    userId,
    password
  )

  let response

  try {
    //Realiza a conexão com o Gerenciador de Fila especificado no objeto MQConnection 
    const conn = await mqConn.connect()
    if (conn != null) {
      const qmm = await new MQQueueMessagingManager['default'](
        conn,
        queueManagerName,
        queueName
      )

      //Exemplo de inserção de mensagem na Fila 'queueName', as sessões nas filas são abertas e fechadas automaticamente a cada operação CRUD executada
      const msgId = await qmm.putMessage('Mensagem de Teste')

      response = {
        statusCode: 201,
        body: ''
      }
    }
  } catch (error) {
    console.log(error)
    response = {
      statusCode: 500,
      body: JSON.stringify(
        {
          message: error.message,
        },
        null,
        2
      ),
    }
  } finally {
    //Realiza a desconexão do Gerenciador de Fila especificado no objeto MQConnection 
    await mqConn.disconnect()
  }

  return response
}

```
## BRIDGE-IBMMQ - Especificação das Funções da Lib

### getMessageList(...)
 * Recupera não-destrutivamente a lista de mensagens disponíveis na fila do IBM MQ
   * @param {string} [correlationId] - Uma string hexadecimal de 48 caracteres que representa o correlation ID
   * @param {string} [messageId] -  Uma string hexadecimal de 48 caracteres que representa o message ID
   * @param {string} [limit=10000] - O número máximo de elementos para serem retornados
   * @param {string} [ibm-mq-rest-csrf-token] - O cabeçalho de proteção CSRF. O valor pode ser qualquer valor inclusive pode ser deixado em branco
   * @param {string} qmgrName - O nome do Gerenciador de Filas a ser utilizado
   * @param {string} qName - O nome da Fila a ser utilizada
   * @return {string} messages - Uma lista JSON contendo as mensagens recuperadas até o limite especificado na chamada da função
	
### deleteMessage(...)
 * Recupera destrutivamente a próxima mensagem disponível na fila do IBM MQ.
   * @param {string} [correlationId] - Uma string hexadecimal de 48 caracteres que representa o correlation ID
   * @param {string} [messageId] -  Uma string hexadecimal de 48 caracteres que representa o message ID
   * @param {string} [wait] - A duração máxima para aguardo da próxima mensagem (em milisegundos).
   * @param {string} [ibm-mq-rest-csrf-token] - O cabeçalho de proteção CSRF. O valor pode ser qualquer valor inclusive pode ser deixado em branco
   * @param {string} qmgrName - O nome do Gerenciador de Filas a ser utilizado
   * @param {string} qName - O nome da Fila a ser utilizada
   * @return {string} message - O texto da mensagem recuperada e apagada da origem
 
### getMessage(...)
 * Recupera não-destrutivamente a próxima mensagem disponível na fila do IBM MQ.
   * @param {string} [correlationId] - Uma string hexadecimal de 48 caracteres que representa o correlation ID
   * @param {string} [messageId] -  Uma string hexadecimal de 48 caracteres que representa o message ID
   * @param {string} [ibm-mq-rest-csrf-token] - O cabeçalho de proteção CSRF. O valor pode ser qualquer valor inclusive pode ser deixado em branco
   * @param {string} qmgrName - O nome do Gerenciador de Filas a ser utilizado
   * @param {string} qName - O nome da Fila a ser utilizada
   * @return {string} message - O texto da mensagem recuperada
	
### putMessage(...)
 * Insere uma mensagem de texto codificada em UTF-8 em uma fila do IBM MQ.
    * @param {string} body - Corpo da mensagem.
    * @param {string} [ibm-mq-rest-csrf-token] - O cabeçalho de proteção CSRF. O valor pode ser qualquer valor inclusive pode ser deixado em branco
    * @param {string} [ibm-mq-md-correlationId] - Uma string hexadecimal de 48 caracteres que representa o correlation ID.
    * @param {string} [ibm-mq-md-expiry] - Tempo máximo de permanência da mensagem na Fila (em milisegundos)
    * @param {string} [ibm-mq-md-persistence=nonPersistent] - Indica o tipo de persistência da mensagem na Fila. Valores disponíveis: [nonPersistent, persistent].
    * @param {string} [ibm-mq-md-replyTo] - Destino de reply-to para a mensagem. (Formato: myReplyQueue[@myReplyQMgr])
    * @param {string} qmgrName - O nome do Gerenciador de Filas a ser utilizado
    * @param {string} qName - O nome da Fila a ser utilizada
    * @return {string} messageId - O ID da mensagem gerada