package com.knot.backend.global.logging;

import java.util.function.LongSupplier;
import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.transaction.PlatformTransactionManager;

public final class TransactionTimingPostProcessor implements BeanPostProcessor {

    private final LongSupplier nanoTime;

    public TransactionTimingPostProcessor(LongSupplier nanoTime) {
        this.nanoTime = nanoTime;
    }

    @Override
    public Object postProcessAfterInitialization(
            Object bean,
            String beanName
    ) {
        if (!PlatformTransactionManager.class.isInstance(bean)) {
            return bean;
        }
        ProxyFactory proxy = new ProxyFactory(bean);
        proxy.setProxyTargetClass(false);
        proxy.addAdvice((MethodInterceptor) this::measureCompletion);
        return proxy.getProxy();
    }

    private Object measureCompletion(MethodInvocation invocation) throws Throwable {
        RequestJdbcTiming timing = RequestJdbcTimingContext.current();
        String method = invocation.getMethod()
                .getName();
        if (timing == null || !isCompletion(method)) {
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
                            "spring_" + method,
                            null,
                            started,
                            nanoTime.getAsLong(),
                            success
                    );
        }
    }

    private boolean isCompletion(String method) {
        return "commit".equals(method) || "rollback".equals(method);
    }
}
