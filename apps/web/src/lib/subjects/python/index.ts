import { defineCourse } from "@/lib/subjects/_core/defineCourse";
import { PY_SUBJECT } from "./subject";
import { PY_MODULE0 } from "./modules/module0";
import {PY_MODULE1} from "./modules/module1";
import {PY_MODULE2} from "@/lib/subjects/python/modules/module2";

export const PYTHON = defineCourse({
    subject: PY_SUBJECT,
    modules: [
        PY_MODULE0,
        PY_MODULE1,
        PY_MODULE2
    ],
});