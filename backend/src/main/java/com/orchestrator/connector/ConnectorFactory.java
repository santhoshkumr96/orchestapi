package com.orchestrator.connector;

import com.orchestrator.model.enums.ConnectorType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ConnectorFactory {
    private final JdbcConnector jdbcConnector;
    private final RedisConnector redisConnector;
    private final ElasticsearchConnector elasticsearchConnector;
    private final KafkaConnector kafkaConnector;
    private final RabbitMqConnector rabbitMqConnector;
    private final MongoConnector mongoConnector;

    public InfraConnector getConnector(ConnectorType type) {
        return switch (type) {
            case MYSQL, POSTGRES, ORACLE, SQLSERVER -> jdbcConnector;
            case REDIS -> redisConnector;
            case ELASTICSEARCH -> elasticsearchConnector;
            case KAFKA -> kafkaConnector;
            case RABBITMQ -> rabbitMqConnector;
            case MONGODB -> mongoConnector;
        };
    }
}
