package com.knot.backend.global.logging;

import com.knot.backend.document.application.DocumentDetailQuery;
import com.knot.backend.document.application.DocumentListQuery;
import java.util.function.LongSupplier;
import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.BeanPostProcessor;

public final class DocumentQueryTimingPostProcessor implements BeanPostProcessor {

    private final LongSupplier nanoTime;

    public DocumentQueryTimingPostProcessor(LongSupplier nanoTime) {
        this.nanoTime = nanoTime;
    }

    @Override
    public Object postProcessAfterInitialization(
            Object bean,
            String beanName
    ) {
        String prefix = queryPrefix(bean);
        if (prefix == null) {
            return bean;
        }
        ProxyFactory proxy = new ProxyFactory(bean);
        proxy.setProxyTargetClass(false);
        proxy.addAdvice(
                (MethodInterceptor) invocation -> measureQuery(
                        invocation,
                        prefix
                )
        );
        return proxy.getProxy();
    }

    private String queryPrefix(Object bean) {
        if (DocumentListQuery.class.isInstance(bean)) {
            return "query_list_";
        }
        if (DocumentDetailQuery.class.isInstance(bean)) {
            return "query_detail_";
        }
        return null;
    }

    private Object measureQuery(
            MethodInvocation invocation,
            String prefix
    ) throws Throwable {
        RequestJdbcTiming timing = RequestJdbcTimingContext.current();
        String method = invocation.getMethod()
                .getName();
        if (timing == null || !method.startsWith("find")) {
            return invocation.proceed();
        }
        long started = nanoTime.getAsLong();
        boolean success = false;
        try {
            Object result = invocation.proceed();
            success = true;
            return result;
        } finally {
            timing.phases()
                    .operation(
                            prefix + method,
                            null,
                            started,
                            nanoTime.getAsLong(),
                            success
                    );
        }
    }
}
