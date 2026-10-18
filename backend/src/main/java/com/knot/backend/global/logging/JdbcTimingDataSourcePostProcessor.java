package com.knot.backend.global.logging;

import javax.sql.DataSource;
import net.ttddyy.dsproxy.support.ProxyDataSource;
import net.ttddyy.dsproxy.support.ProxyDataSourceBuilder;
import org.springframework.beans.factory.config.BeanPostProcessor;

public final class JdbcTimingDataSourcePostProcessor implements BeanPostProcessor {

    @Override
    public Object postProcessAfterInitialization(
            Object bean,
            String beanName
    ) {
        if (!DataSource.class.isInstance(bean) || ProxyDataSource.class.isInstance(bean)) {
            return bean;
        }
        return ProxyDataSourceBuilder.create(DataSource.class.cast(bean))
                .name(beanName)
                .proxyResultSet()
                .listener(new JdbcTimingListener(System::nanoTime))
                .build();
    }
}
