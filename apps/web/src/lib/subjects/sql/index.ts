import subjectManifest from "./subject.manifest.json";
import { TOPIC_MANIFESTS } from "./topics.generated";
import { defineCourseFromManifest } from "@/lib/subjects/_core/defineCourseFromManifest";

export const SQL = defineCourseFromManifest({
    manifest: subjectManifest,
    topicManifests: TOPIC_MANIFESTS,
});












// import { defineCourse } from "@/lib/subjects/_core/defineCourse";
// import { SQL_SUBJECT } from "./subject";
// import { SQL_MODULE0 } from "./modules/module0";
// import {SQL_MODULE1} from "@/lib/subjects/sql/modules/module1";
// import {SQL_MODULE2} from "@/lib/subjects/sql/modules/module2";
// import {SQL_MODULE3} from "@/lib/subjects/sql/modules/module3";
// import {SQL_MODULE4} from "@/lib/subjects/sql/modules/module4";
//
// export const SQL = defineCourse({
//     subject: SQL_SUBJECT,
//     modules: [
//         SQL_MODULE0,
//         SQL_MODULE1,
//         SQL_MODULE2,
//         SQL_MODULE3,
//         SQL_MODULE4
//
//
//     ],
// });