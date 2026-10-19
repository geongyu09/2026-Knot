import { useSentryRoutes } from "@provider/sentry";
import { routes } from "@routes/routes";

const App = () => {
  return useSentryRoutes(routes);
};

export default App;
