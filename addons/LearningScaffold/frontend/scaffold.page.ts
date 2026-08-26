import './scaffold.css';
import { addPage, NamedPage } from '@hydrooj/ui-default';
import { initLearningScaffold } from './scaffold';

addPage(new NamedPage(['problem_ide'], async () => {
    initLearningScaffold();
}));
