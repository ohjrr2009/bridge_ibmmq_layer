import ibmmq from 'ibmmq'

class MQConnection {
    private static MQC = ibmmq.MQC
    private connection = new ibmmq.MQCNO()
    private securityParameters = new ibmmq.MQCSP()
    private channelDefinition = new ibmmq.MQCD()
    private queueManagerConnection = null

    private userId: string
    private password: string
    private hostIp: string
    private hostPort: string
    private channelName: string
    private queueManagerName: string

    constructor(
        hostIp: string,
        hostPort: string,
        queueManagerName: string,
        channelName: string,
        userId: string,
        password: string,
    ) {
        this.userId = userId
        this.password = password
        this.hostIp = hostIp
        this.hostPort = hostPort
        this.queueManagerName = queueManagerName
        this.channelName = channelName
    }

    public async connect() {
        //console.log('Iniciando o processo de conexão...')

        this.securityParameters.UserId = this.userId
        this.securityParameters.Password = this.password

        this.connection.SecurityParms = this.securityParameters
        this.connection.Options = MQConnection.MQC.MQCNO_CLIENT_BINDING

        this.channelDefinition.ConnectionName = `${this.hostIp}(${this.hostPort})`
        this.channelDefinition.ChannelName = this.channelName

        this.connection.ClientConn = this.channelDefinition

        try {
            const connPromise = await ibmmq.ConnxPromise(
                this.queueManagerName,
                this.connection,
            )

            // console.log(
            //     `Conexão estabelecida a ${this.queueManagerName} com sucesso`,
            // )

            this.queueManagerConnection = connPromise

            //console.log(this.queueManagerConnection)
        } catch (error) {
            console.log(`Conexão falhou: ${error.message}`)
        }

        return this.queueManagerConnection
    }

    public getConnection() {
        return this.queueManagerConnection
    }

    public async disconnect() {
        try {
            const disconPromise = await ibmmq.DiscPromise(
                this.queueManagerConnection,
            )

            //console.log(`${this.queueManagerName} desconectou com sucesso`)
        } catch (error) {
            console.log(
                `Erro durante a desconexão ${this.queueManagerConnection} => ${error.message}`,
            )
        }
    }
}

export default MQConnection
