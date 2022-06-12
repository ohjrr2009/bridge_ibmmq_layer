import ibmmq from 'ibmmq'
//import StringDecoder from 'string_decoder'
import MQConnection from './MQConnection'

class MQQueueMessagingManager {
    private static MQC = ibmmq.MQC
    private queueManagerName: string
    private queueManagerConnection: MQConnection
    private queueName: string
    //private decoder = new StringDecoder.StringDecoder('utf8')
    private queueOpened = null

    constructor(
        queueManagerConnection: MQConnection,
        queueManagerName: string,
        queueName: string,
    ) {
        this.queueManagerName = queueManagerName
        this.queueManagerConnection = queueManagerConnection
        this.queueName = queueName
    }

    /**
     * Abre a conexão com a Fila
     * type=['BROWSE','GET_N_REMOVE','INSERT']
     */
    private async openQueue(type = 'BROWSE') {
        const objectDescriptor = new ibmmq.MQOD()
        objectDescriptor.ObjectName = this.queueName
        objectDescriptor.ObjectType = MQQueueMessagingManager.MQC.MQOT_Q

        let openOptions
        if (type == 'BROWSE') {
            openOptions = MQQueueMessagingManager.MQC.MQOO_BROWSE
        } else if (type == 'GET_N_REMOVE') {
            openOptions = MQQueueMessagingManager.MQC.MQOO_INPUT_AS_Q_DEF
        }
        else if (type == 'INSERT'){
            openOptions = MQQueueMessagingManager.MQC.MQOO_OUTPUT
        }

        let queueOpened = null
        try {
            queueOpened = await ibmmq.OpenPromise(
                this.queueManagerConnection,
                objectDescriptor,
                openOptions,
            )
            //console.log('Fila aberta com sucesso')
        } catch (error) {
            console.log(
                'Erro detectado na abertura da conexão com a fila',
                error,
            )
        }

        this.queueOpened = queueOpened

        return queueOpened
    }

    //Fecha a conexão com a Fila
    private async closeQueue() {
        if (this.queueOpened != null) {
            try {
                await ibmmq.ClosePromise(this.queueOpened, 0)
                //console.log('Fila fechada com sucesso')
            } catch (error) {
                console.log(`Erro no fechamento da fila: ${error.message}`)
            }
        } else {
            console.log(
                `Erro no fechamento da fila ${this.queueName}: A fila não está aberta.`,
            )
        }
    }

    /**
     * Recupera não-destrutivamente a lista bruta de mensagens disponíveis na fila do IBM MQ.
     *  - type:string - Tipo de lista bruta de mensagens [LIST,UNIT,RAW]
     *  - correlationId:string - A 48 character correlation ID hex-string.
     *  - messageId:string -  A 48 character message ID hex-string.
     *  - limit:string = 10000 (Padrão) - The maximum number of message elements to return.
     *  - ibm-mq-rest-csrf-token: string - The CSRF protection header. The value can be any value, including a blank string.
     */
    public async getRawMessageList(
        type: string,
        correlationId?: string,
        messageId?: string,
        limit = '10000',
        ibm_mq_rest_csrf_token = '',
    ) {
        //Abre a conexão com a Fila
        const queueOpened = await this.openQueue('BROWSE')

        //Retorna as mensagens
        const messageDescriptor = new ibmmq.MQMD()
        const messageOptions = new ibmmq.MQGMO()

        messageOptions.Options =
            MQQueueMessagingManager.MQC.MQGMO_NO_SYNCPOINT |
            MQQueueMessagingManager.MQC.MQGMO_WAIT |
            MQQueueMessagingManager.MQC.MQGMO_CONVERT |
            MQQueueMessagingManager.MQC.MQGMO_FAIL_IF_QUIESCING |
            MQQueueMessagingManager.MQC.MQGMO_BROWSE_FIRST

        messageOptions.MatchOptions = MQQueueMessagingManager.MQC.MQMO_NONE

        if (messageId) {
            messageOptions.MatchOptions |=
                MQQueueMessagingManager.MQC.MQMO_MATCH_MSG_ID
            messageDescriptor.MsgId =
                MQQueueMessagingManager.hexToBytes(messageId)
        }

        if (correlationId) {
            messageOptions.MatchOptions |=
                MQQueueMessagingManager.MQC.MQMO_MATCH_CORREL_ID
            messageDescriptor.CorrelId =
                MQQueueMessagingManager.hexToBytes(correlationId)
        }

        messageOptions.WaitInterval = 100 //se removido fará o listener ficar constantemente acordado

        const messages: Array<Record<string, string>> = []

        let errorMessage

        let hasNext = true

        for (let index = 0; index < Number(limit); index++) {
            if (hasNext) {
                const buffer = Buffer.alloc(256000)

                ibmmq.GetSync(
                    queueOpened,
                    messageDescriptor,
                    messageOptions,
                    buffer,
                    (error, length) => {
                        const format = messageDescriptor.Format
                        const msgId = MQQueueMessagingManager.toHexString(
                            messageDescriptor.MsgId,
                        )
                        const correlId = MQQueueMessagingManager.toHexString(
                            messageDescriptor.CorrelId,
                        )
                        let message

                        if (error) {
                            if (
                                error.mqrc ==
                                MQQueueMessagingManager.MQC
                                    .MQRC_NO_MSG_AVAILABLE
                            ) {
                                //console.log('Listagem de mensagens finalizada.')
                            } else {
                                console.log(
                                    `Operação de listagem de mensagens falhou: ${error.message}`,
                                )

                                errorMessage = {
                                    type: null,
                                    msgId: msgId,
                                    message: error.message,
                                    explanation: null,
                                    action: null,
                                    qmgrName: this.queueManagerName,
                                    completioncode: null,
                                    reasonCode: null,
                                }
                            }

                            hasNext = false
                        } else {
                            if (format == 'MQSTR') {
                                const buffString = JSON.stringify(
                                    buffer
                                        .toString('utf8')
                                        .substring(0, length),
                                )
                                message = JSON.parse(buffString)
                            } else {
                                message = buffer
                            }

                            let msg
                            if (type == 'RAW') {
                                msg = {
                                    messageId: msgId,
                                    messageFormat: format,
                                    correlationId: correlId,
                                    messageBody: message,
                                }
                            } else if (type == 'LIST') {
                                if (parseInt(correlId) === 0) {
                                    msg = {
                                        messageId: msgId,
                                        messageFormat: format,
                                    }
                                } else {
                                    msg = {
                                        messageId: msgId,
                                        messageFormat: format,
                                        correlationId: correlId,
                                    }
                                }
                            } else if (type == 'UNIT') {
                                msg = message
                            }

                            messages.push(msg)

                            // Remove a opção original usando uma operação bitwise para limpar a flag
                            messageOptions.Options &=
                                ~MQQueueMessagingManager.MQC.MQGMO_BROWSE_FIRST

                            // Configura a nova flag para buscar as próximas mensagens
                            messageOptions.Options |=
                                MQQueueMessagingManager.MQC.MQGMO_BROWSE_NEXT
                        }
                    },
                )
            } else {
                break
            }
        }

        //Fecha a conexão com a Fila
        await this.closeQueue()

        let messageList
        if (type == 'RAW' || type == 'LIST') {
            messageList = {
                messages: messages,
            }
        } else if (type == 'UNIT') {
            if (messages.length == 0) {
                messageList = ''
            } else {
                messageList = messages[0]
            }
        }

        if (errorMessage) {
            return JSON.stringify(errorMessage, null, '\t')
        } else {
            return JSON.stringify(messageList, null, '\t')
        }
    }

    /**
     * Recupera não-destrutivamente a lista de mensagens disponíveis na fila do IBM MQ.
     * Mapeamento REST: ibmmq/rest/v2/messaging/qmgr/{qmgrName}/queue/{qName}/messagelist
     *  - correlationId:string - A 48 character correlation ID hex-string.
     *  - messageId:string -  A 48 character message ID hex-string.
     *  - limit:string = 10000 (Padrão) - The maximum number of message elements to return.
     *  - ibm-mq-rest-csrf-token: string - The CSRF protection header. The value can be any value, including a blank string.
     */
    public getMessageList(
        correlationId?: string,
        messageId?: string,
        limit?: string,
        ibm_mq_rest_csrf_token?: string,
    ) {
        return this.getRawMessageList(
            'LIST',
            correlationId,
            messageId,
            limit,
            ibm_mq_rest_csrf_token,
        )
    }

    /**
     * Recupera destrutivamente a próxima mensagem disponível na fila do IBM MQ.
     * Mapeamento REST: /ibmmq/rest/v2/messaging/qmgr/{qmgrName}/queue/{qName}/message
     *  - correlationId:string - A 48 character correlation ID hex-string.
     *  - messageId:string -  A 48 character message ID hex-string.
     *  - wait:string - The maximum duration to wait for next message, in milliseconds.
     *  - ibm-mq-rest-csrf-token: string - The CSRF protection header. The value can be any value, including a blank string.
     */
    public async deleteMessage(
        correlationId?: string,
        messageId?: string,
        wait?: string,
        ibm_mq_rest_csrf_token?: string,
    ) {
        //Abre a conexão com a Fila
        const queueOpened = await this.openQueue('GET_N_REMOVE')

        //Retorna as mensagens
        const messageDescriptor = new ibmmq.MQMD()
        const messageOptions = new ibmmq.MQGMO()

        messageOptions.Options =
            MQQueueMessagingManager.MQC.MQGMO_NO_SYNCPOINT |
            MQQueueMessagingManager.MQC.MQGMO_NO_WAIT |
            MQQueueMessagingManager.MQC.MQGMO_CONVERT |
            MQQueueMessagingManager.MQC.MQGMO_FAIL_IF_QUIESCING

        messageOptions.MatchOptions = MQQueueMessagingManager.MQC.MQMO_NONE

        if (messageId) {
            messageOptions.MatchOptions |=
                MQQueueMessagingManager.MQC.MQMO_MATCH_MSG_ID
            messageDescriptor.MsgId =
                MQQueueMessagingManager.hexToBytes(messageId)
        }

        if (correlationId) {
            messageOptions.MatchOptions |=
                MQQueueMessagingManager.MQC.MQMO_MATCH_CORREL_ID
            messageDescriptor.CorrelId =
                MQQueueMessagingManager.hexToBytes(correlationId)
        }

        const messages: Array<Record<string, string>> = []

        let errorMessage

        const buffer = Buffer.alloc(256000)

        ibmmq.GetSync(
            queueOpened,
            messageDescriptor,
            messageOptions,
            buffer,
            (error, length) => {
                const format = messageDescriptor.Format
                const msgId = MQQueueMessagingManager.toHexString(
                    messageDescriptor.MsgId,
                )
                const correlId = MQQueueMessagingManager.toHexString(
                    messageDescriptor.CorrelId,
                )
                let message

                if (error) {
                    if (
                        error.mqrc ==
                        MQQueueMessagingManager.MQC.MQRC_NO_MSG_AVAILABLE
                    ) {
                        //console.log('Listagem de mensagens finalizada.')
                    } else {
                        console.log(
                            `Operação de listagem de mensagens falhou: ${error.message}`,
                        )

                        errorMessage = {
                            type: null,
                            msgId: msgId,
                            message: error.message,
                            explanation: null,
                            action: null,
                            qmgrName: this.queueManagerName,
                            completioncode: null,
                            reasonCode: null,
                        }
                    }
                } else {
                    if (format == 'MQSTR') {
                        const buffString = JSON.stringify(
                            buffer.toString('utf8').substring(0, length),
                        )
                        message = JSON.parse(buffString)
                    } else {
                        message = buffer
                    }

                    messages.push(message)
                }
            },
        )

        //Fecha a conexão com a Fila
        await this.closeQueue()

        if (errorMessage) {
            return JSON.stringify(errorMessage, null, '\t')
        } else {
            if (messages.length == 0) {
                return JSON.stringify('', null, '\t')
            } else {
                return JSON.stringify(messages[0], null, '\t')
            }
        }
    }

    /**
     * Recupera não-destrutivamente a próxima mensagem disponível na fila do IBM MQ.
     * Mapeamento REST: /ibmmq/rest/v2/messaging/qmgr/{qmgrName}/queue/{qName}/message
     *  - correlationId:string - A 48 character correlation ID hex-string.
     *  - messageId:string -  A 48 character message ID hex-string.
     *  - ibm-mq-rest-csrf-token: string - The CSRF protection header. The value can be any value, including a blank string.
     */
    public getMessage(
        correlationId?: string,
        messageId?: string,
        ibm_mq_rest_csrf_token?: string,
    ) {
        const messageList = this.getRawMessageList(
            'UNIT',
            correlationId,
            messageId,
            '1',
            undefined,
        )

        return messageList
    }

    /**
     * Insere uma mensagem de texto codificada em UTF-8 em uma fila do IBM MQ.
     * Mapeamento REST: /ibmmq/rest/v2/messaging/qmgr/{qmgrName}/queue/{qName}/message
     *  - body:string - Corpo da mensagem.
     *  - ibm-mq-rest-csrf-token: string - The CSRF protection header. The value can be any value, including a blank string.
     *  - ibm-mq-md-correlationId:string - A 48 character correlation ID.
     *  - ibm-mq-md-expiry:string - The maximum time to keep the message on the queue, in milliseconds.
     *  - ibm-mq-md-persistence:string - The message persistence. Available values: [nonPersistent, persistent]. Default value: nonPersistent
     *  - ibm-mq-md-replyTo:string The reply-to destination for the message. (Format: myReplyQueue[@myReplyQMgr])
     */
    public async putMessage(
        body = '',
        ibm_mq_rest_csrf_token = '',
        ibm_mq_md_correlationId?: string,
        ibm_mq_md_expiry?: string,
        ibm_mq_md_persistence?: string,
        ibm_mq_md_replyTo?: string,
    ) {
        //Abre a conexão com a Fila
        const queueOpened = await this.openQueue('INSERT')

        //Retorna as mensagens
        const messageDescriptor = new ibmmq.MQMD()
        const putMessageOptions = new ibmmq.MQPMO()

        putMessageOptions.Options =
            MQQueueMessagingManager.MQC.MQPMO_NO_SYNCPOINT |
            MQQueueMessagingManager.MQC.MQPMO_NEW_MSG_ID
        
        if (ibm_mq_md_expiry){
            try {
                messageDescriptor.Expiry = parseInt(ibm_mq_md_expiry)/100    
            } catch (error) {
                console.log(error)
            }
        }

        if (ibm_mq_md_replyTo){
            const texto = ibm_mq_md_replyTo.split('@')
            messageDescriptor.ReplyToQ = texto[0]
            if (texto.length == 2){
                messageDescriptor.ReplyToQMgr = texto[1]
            }
        }

        if (ibm_mq_md_persistence){
            if (ibm_mq_md_persistence == 'nonPersistent'){
                messageDescriptor.Persistence = MQQueueMessagingManager.MQC.MQPER_NOT_PERSISTENT
            }
            else if (ibm_mq_md_persistence == 'persistent'){
                messageDescriptor.Persistence = MQQueueMessagingManager.MQC.MQPER_PERSISTENT
            }
        }
        else{
            messageDescriptor.Persistence = MQQueueMessagingManager.MQC.MQPER_PERSISTENCE_AS_Q_DEF
        }
        
        if (ibm_mq_md_correlationId) {
            messageDescriptor.CorrelId =
                MQQueueMessagingManager.hexToBytes(ibm_mq_md_correlationId)
        }
        else{
            putMessageOptions.Options |=
            MQQueueMessagingManager.MQC.MQPMO_NEW_CORREL_ID
        }

        // console.log('messageDescriptor', messageDescriptor)
        
        // const msg = JSON.stringify(body)
        const msg = body

        let errorMessage

        ibmmq.Put(queueOpened, messageDescriptor, putMessageOptions, msg, 
            (error) => {
                const msgId = MQQueueMessagingManager.toHexString(messageDescriptor.MsgId)
            if (error) {
                console.log('Erro detectado na operação de inserção de mensagem', error.message);

                errorMessage = {
                    type: null,
                    msgId: msgId,
                    message: error.message,
                    explanation: null,
                    action: null,
                    qmgrName: this.queueManagerName,
                    completioncode: null,
                    reasonCode: null
                }
            } else {
                //console.log("Mensagem inserida com sucesso. MsgId: ", msgId)
            }
        })

        //Fecha a conexão com a Fila
        await this.closeQueue()

        if (errorMessage) {
            return JSON.stringify(errorMessage, null, '\t')
        } else {
            return ''
        }
    }

    private static toHexString(byteArray) {
        return byteArray.reduce(
            (output, elem) => output + ('0' + elem.toString(16)).slice(-2),
            '',
        )
    }

    private static hexToBytes(hex: string) {
        const bytes: Array<number> = []
        for (let c = 0; c < hex.length; c += 2) {
            const text = hex.substr(c, 2)
            bytes.push(parseInt(text, 16))
        }
        return bytes
    }
}

export default MQQueueMessagingManager
